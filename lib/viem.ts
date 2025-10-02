// lib/viem.ts
import { createPublicClient, defineChain, http } from "viem";

// strict env helper
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const RPC_URL = requireEnv("RPC_URL");      // Render env
const CHAIN_ID = Number(requireEnv("CHAIN_ID"));

export const appChain = defineChain({
  id: CHAIN_ID,
  name: `AppChain-${CHAIN_ID}`,
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
});

export const publicClient = createPublicClient({
  chain: appChain,
  transport: http(RPC_URL),
});
