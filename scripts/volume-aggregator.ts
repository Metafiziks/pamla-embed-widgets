// scripts/volume-aggregator.ts
// Aggregates Buy/Sell volume from your BondingCurveToken and persists to Render Disk.

import fs from 'fs';
import path from 'path';
import { createPublicClient, http, parseAbi, formatEther } from 'viem';

// ====== ENV ======
const RPC_URL   = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.testnet.abs.xyz';
const CURVE     = (process.env.NEXT_PUBLIC_TOKEN || '').toLowerCase() as `0x${string}`;

// scanning controls
const LOOKBACK  = Number(process.env.LOOKBACK || '50000');  // how many blocks back from tip
const FROM_BLOCK_ENV = process.env.FROM_BLOCK ? BigInt(process.env.FROM_BLOCK) : null;
const TO_BLOCK_ENV   = process.env.TO_BLOCK   ? BigInt(process.env.TO_BLOCK)   : null;
const STEP      = BigInt(process.env.STEP || '3000');       // blocks per getLogs batch
const TOP_N     = Number(process.env.TOP_N || '100');       // limit in the JSON (CSV writes all)

// disk output
const OUT_DIR   = process.env.OUT_DIR || '/data/leaderboard'; // Render Disk mount path (persisted)

// ====== Minimal ABI for events we care about ======
const abi = parseAbi([
  'event Buy(address indexed buyer, uint256 ethIn, uint256 tokensOut)',
  'event Sell(address indexed seller, uint256 amountIn, uint256 ethOut)',
]);

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
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function toCsv(rows: Totals[]): string {
  const header = [
    'address',
    'buy_eth',
    'sell_eth',
    'total_eth',
    'buy_tokens',
    'sell_tokens',
    'buy_count',
    'sell_count',
    'last_block',
  ].join(',');

  const lines = rows.map(r => [
    r.address,
    formatEther(r.buyEth),
    formatEther(r.sellEth),
    formatEther(r.buyEth + r.sellEth),
    formatEther(r.buyTokens),
    formatEther(r.sellTokens),
    r.buyCount,
    r.sellCount,
    r.lastBlock.toString(),
  ].join(','));

  return [header, ...lines].join('\n');
}

async function main() {
  if (!CURVE || !CURVE.startsWith('0x') || CURVE.length !== 42) {
    throw new Error('Missing or invalid NEXT_PUBLIC_TOKEN (contract address).');
  }

  const tip = await client.getBlockNumber();
  const toBlock   = TO_BLOCK_ENV   ?? tip;
  const fromBlock = FROM_BLOCK_ENV ?? (toBlock - BigInt(LOOKBACK) > 0n ? toBlock - BigInt(LOOKBACK) : 0n);

  console.log(`Scanning ${CURVE} from block ${fromBlock} to ${toBlock} in steps of ${STEP}…`);

  const map = new Map<string, Totals>();

  // Batch over block ranges for both events
  for (let start = fromBlock; start <= toBlock; start += STEP + 1n) {
    const end = start + STEP > toBlock ? toBlock : start + STEP;

    // Buy events
    const buyLogs = await client.getLogs({
      address: CURVE,
      fromBlock: start,
      toBlock: end,
      event: {
        type: 'event',
        name: 'Buy',
        inputs: [
          { indexed: true,  name: 'buyer',     type: 'address' },
          { indexed: false, name: 'ethIn',     type: 'uint256' },
          { indexed: false, name: 'tokensOut', type: 'uint256' },
        ],
      } as any,
    });

    for (const lg of buyLogs as any[]) {
      const buyer  = (lg.args?.buyer as `0x${string}`).toLowerCase() as `0x${string}`;
      const ethIn  = lg.args?.ethIn     as bigint;
      const tokens = lg.args?.tokensOut as bigint;
      const blk    = lg.blockNumber as bigint;

      const t = map.get(buyer) ?? emptyTotals(buyer);
      t.buyEth     += ethIn;
      t.buyTokens  += tokens;
      t.buyCount   += 1;
      if (blk > t.lastBlock) t.lastBlock = blk;
      map.set(buyer, t);
    }

    // Sell events
    const sellLogs = await client.getLogs({
      address: CURVE,
      fromBlock: start,
      toBlock: end,
      event: {
        type: 'event',
        name: 'Sell',
        inputs: [
          { indexed: true,  name: 'seller',   type: 'address' },
          { indexed: false, name: 'amountIn', type: 'uint256' }, // tokens burned
          { indexed: false, name: 'ethOut',   type: 'uint256' }, // ETH returned
        ],
      } as any,
    });

    for (const lg of sellLogs as any[]) {
      const seller = (lg.args?.seller as `0x${string}`).toLowerCase() as `0x${string}`;
      const tokIn  = lg.args?.amountIn as bigint;
      const ethOut = lg.args?.ethOut   as bigint;
      const blk    = lg.blockNumber as bigint;

      const t = map.get(seller) ?? emptyTotals(seller);
      t.sellEth     += ethOut;
      t.sellTokens  += tokIn;
      t.sellCount   += 1;
      if (blk > t.lastBlock) t.lastBlock = blk;
      map.set(seller, t);
    }

    console.log(`  processed blocks ${start}–${end} | +${buyLogs.length} buys, +${sellLogs.length} sells`);
  }

  // Rank by total ETH volume (buy + sell)
  const rows = [...map.values()]
    .sort((a, b) => {
      const A = a.buyEth + a.sellEth;
      const B = b.buyEth + b.sellEth;
      if (A !== B) return Number(B - A);
      // tie-breaker by most recent activity
      if (a.lastBlock !== b.lastBlock) return Number(b.lastBlock - a.lastBlock);
      return 0;
    });

  // Ensure output dir on Render Disk
  ensureDir(OUT_DIR);

  // Write JSON (strings for bigints)
  const jsonPath = path.join(OUT_DIR, 'participants_volume.json');
  const jsonOut = rows.slice(0, TOP_N).map(r => ({
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
  fs.writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2));
  console.log(`✅ wrote ${jsonPath} (${jsonOut.length} addrs)`);

  // Write CSV (all rows)
  const csvPath = path.join(OUT_DIR, 'participants_volume.csv');
  fs.writeFileSync(csvPath, toCsv(rows));
  console.log(`✅ wrote ${csvPath} (${rows.length} addrs)`);

  console.log('Done.');
}

main().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
