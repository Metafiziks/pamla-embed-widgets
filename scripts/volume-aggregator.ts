// scripts/volume-aggregator.ts
// Aggregates Buy/Sell volume from your BondingCurveToken and persists to Render Disk.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createPublicClient, http, formatEther } from "viem";

// ====== ENV ======
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.testnet.abs.xyz";
const CURVE = (process.env.NEXT_PUBLIC_TOKEN || "").toLowerCase() as `0x${string}`;

// scanning controls
const LOOKBACK = Number(process.env.LOOKBACK || "50000");
const FROM_BLOCK_ENV = process.env.FROM_BLOCK ? BigInt(process.env.FROM_BLOCK) : null;
const TO_BLOCK_ENV = process.env.TO_BLOCK ? BigInt(process.env.TO_BLOCK) : null;
const STEP = BigInt(process.env.STEP || "3000");
const TOP_N = Number(process.env.TOP_N || "100");

// disk output
const OUT_DIR = process.env.OUT_DIR || "/opt/render/data/leaderboard";

// ====== Types ======
type Totals = {
  address: `0x${string}`;
  buyEth: bigint;
  sellEth: bigint;
  buyTokens: bigint;
  sellTokens: bigint;
  buyCount: number;
  sellCount: number;
  lastBlock: bigint;
};

function emptyTotals(addr: `0x${string}`): Totals {
  return {
    address: addr,
    buyEth: 0n,
    sellEth: 0n,
    buyTokens: 0n,
    sellTokens: 0n,
    buyCount: 0,
    sellCount: 0,
    lastBlock: 0n,
  };
}

// ====== Client ======
const client = createPublicClient({
  transport: http(RPC_URL),
});

// ====== Helpers ======
function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function toCsv(rows: Totals[]): string {
  const header = [
    "address",
    "buy_eth",
    "sell_eth",
    "total_eth",
    "buy_tokens",
    "sell_tokens",
    "buy_count",
    "sell_count",
    "last_block",
  ].join(",");

  const lines = rows.map((r) =>
    [
      r.address,
      formatEther(r.buyEth),
      formatEther(r.sellEth),
      formatEther(r.buyEth + r.sellEth),
      formatEther(r.buyTokens),
      formatEther(r.sellTokens),
      r.buyCount,
      r.sellCount,
      r.lastBlock.toString(),
    ].join(",")
  );

  return [header, ...lines].join("\n");
}

// ====== MAIN ======
async function main() {
  console.log("RPC_URL:", RPC_URL);
  console.log("CURVE:", CURVE);
  console.log("OUT_DIR:", OUT_DIR);

  if (!CURVE || !CURVE.startsWith("0x") || CURVE.length !== 42) {
    throw new Error("Missing or invalid NEXT_PUBLIC_TOKEN (contract address).");
  }

  const tip = await client.getBlockNumber();
  const toBlock = TO_BLOCK_ENV ?? tip;
  const fromBlock =
    FROM_BLOCK_ENV ?? (toBlock - BigInt(LOOKBACK) > 0n ? toBlock - BigInt(LOOKBACK) : 0n);

  console.log(`Scanning ${CURVE} from block ${fromBlock} to ${toBlock} in steps of ${STEP}…`);

  const map = new Map<string, Totals>();

  for (let start = fromBlock; start <= toBlock; start += STEP + 1n) {
    const end = start + STEP > toBlock ? toBlock : start + STEP;

    // Buy events
    const buyLogs = await client.getLogs({
      address: CURVE,
      fromBlock: start,
      toBlock: end,
      event: {
        type: "event",
        name: "Buy",
        inputs: [
          { indexed: true, name: "buyer", type: "address" },
          { indexed: false, name: "ethIn", type: "uint256" },
          { indexed: false, name: "tokensOut", type: "uint256" },
        ],
      } as any,
    });

    for (const lg of buyLogs as any[]) {
      const buyer = (lg.args?.buyer as `0x${string}`).toLowerCase() as `0x${string}`;
      const ethIn = lg.args?.ethIn as bigint;
      const tokens = lg.args?.tokensOut as bigint;
      const blk = lg.blockNumber as bigint;

      const t = map.get(buyer) ?? emptyTotals(buyer);
      t.buyEth += ethIn;
      t.buyTokens += tokens;
      t.buyCount += 1;
      if (blk > t.lastBlock) t.lastBlock = blk;
      map.set(buyer, t);
    }

    // Sell events
    const sellLogs = await client.getLogs({
      address: CURVE,
      fromBlock: start,
      toBlock: end,
      event: {
        type: "event",
        name: "Sell",
        inputs: [
          { indexed: true, name: "seller", type: "address" },
          { indexed: false, name: "amountIn", type: "uint256" },
          { indexed: false, name: "ethOut", type: "uint256" },
        ],
      } as any,
    });

    for (const lg of sellLogs as any[]) {
      const seller = (lg.args?.seller as `0x${string}`).toLowerCase() as `0x${string}`;
      const tokIn = lg.args?.amountIn as bigint;
      const ethOut = lg.args?.ethOut as bigint;
      const blk = lg.blockNumber as bigint;

      const t = map.get(seller) ?? emptyTotals(seller);
      t.sellEth += ethOut;
      t.sellTokens += tokIn;
      t.sellCount += 1;
      if (blk > t.lastBlock) t.lastBlock = blk;
      map.set(seller, t);
    }

    console.log(`  processed blocks ${start}–${end} | +${buyLogs.length} buys, +${sellLogs.length} sells`);
  }

  // Rank by total ETH volume
  const rows = [...map.values()].sort((a, b) => {
    const A = a.buyEth + a.sellEth;
    const B = b.buyEth + b.sellEth;
    if (A !== B) return Number(B - A);
    if (a.lastBlock !== b.lastBlock) return Number(b.lastBlock - a.lastBlock);
    return 0;
  });

  ensureDir(OUT_DIR);
  console.log("Writing output to", OUT_DIR);

  const jsonOut = rows.slice(0, TOP_N).map((r) => ({
    address: r.address,
    buyEth: r.buyEth.toString(),
    sellEth: r.sellEth.toString(),
    totalEth: (r.buyEth + r.sellEth).toString(),
    buyTokens: r.buyTokens.toString(),
    sellTokens: r.sellTokens.toString(),
    buyCount: r.buyCount,
    sellCount: r.sellCount,
    lastBlock: r.lastBlock.toString(),
  }));

// AFTER computing `jsonOut` (array) and before exiting:

const WEB_BASE_URL = process.env.WEB_BASE_URL // e.g. https://pamla-embed-widgets.onrender.com
const CRON_SECRET  = process.env.LEADERBOARD_SECRET // same value as on web service

if (WEB_BASE_URL && CRON_SECRET) {
  try {
    const res = await fetch(`${WEB_BASE_URL}/api/leaderboard/upload`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-cron-secret': CRON_SECRET,
      },
      body: JSON.stringify(jsonOut),
    })
    if (!res.ok) {
      console.error('Upload failed:', res.status, await res.text())
    } else {
      console.log('✅ Uploaded leaderboard to web app')
    }
  } catch (e: any) {
    console.error('Upload error:', e?.message || e)
  }
} else {
  console.log('Skipping upload: WEB_BASE_URL or LEADERBOARD_SECRET unset')
}

  const jsonPath = path.join(OUT_DIR, "participants_volume.json");
  writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2));
  console.log(`✅ wrote ${jsonPath} (${jsonOut.length} addrs)`);

  const csvPath = path.join(OUT_DIR, "participants_volume.csv");
  writeFileSync(csvPath, toCsv(rows));
  console.log(`✅ wrote ${csvPath} (${rows.length} addrs)`);

  console.log("Done.");
}



// Strong top-level catch
(async () => {
  try {
    console.log("🚀 Starting aggregator...");
    await main();
    console.log("✅ Aggregation complete");
    process.exit(0);
  } catch (e) {
    console.error("❌ UNCAUGHT:", e);
    if (e && typeof e === "object") {
      console.error("STACK:", (e as any).stack);
    }
    process.exit(1);
  }
})();
