// lib/viem.ts
import { createPublicClient, defineChain, http } from "viem";

// Small helper so missing envs throw a clear error at build time
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const RPC_URL = requireEnv("RPC_URL");
const CHAIN_ID = Number(requireEnv("CHAIN_ID"));

// Define your chain from env (works even if it’s not a preset in viem)
export const appChain = defineChain({
  id: CHAIN_ID,
  name: `AppChain-${CHAIN_ID}`,
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
});

// Public client for all read calls
export const publicClient = createPublicClient({
  chain: appChain,
  transport: http(RPC_URL),
});
