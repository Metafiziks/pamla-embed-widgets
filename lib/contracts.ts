// lib/contracts.ts
import type { Address, WalletClient } from "viem";
import { publicClient } from "./viem";

import RegistryAbiJson from "./abi/SongTokenRegistry.json";
import FactoryAbiJson from "./abi/BondingCurveFactory.json";

// strict env helper
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

// Addresses from NEXT_* env (public in Next.js)
export const REGISTRY_ADDRESS = requireEnv("NEXT_PUBLIC_REGISTRY") as Address;
export const FACTORY_ADDRESS  = requireEnv("NEXT_PUBLIC_FACTORY")  as Address;

// ABIs (support both truffle-style {abi:[]} and pure arrays)
export const REGISTRY_ABI = (RegistryAbiJson as any).abi ?? (RegistryAbiJson as any);
export const FACTORY_ABI  = (FactoryAbiJson as any).abi  ?? (FactoryAbiJson as any);

/**
 * -------- READ HELPERS (no signer needed) --------
 * Use these anywhere in your app for reads.
 */

export function registryOwner() {
  return publicClient.readContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: "owner",
    args: [],
  }) as Promise<Address>;
}

export function registryFactory() {
  return publicClient.readContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: "factory",
    args: [],
  }) as Promise<Address>;
}

// example: if you have more registry views, add them similarly:
// export function someView(arg1: bigint) { ... }

/**
 * -------- WRITE HELPERS (needs a WalletClient) --------
 * Call these where you already have a connected wallet (wagmi/viem).
 * Example usage shown below.
 */

export async function createSongTokenWrite(
  walletClient: WalletClient,
  params: { name: string; symbol: string; treasury: Address; feeBps: number | bigint }
) {
  if (!walletClient.account) {
    throw new Error("Wallet client has no account (user not connected).");
  }

  const feeBps =
    typeof params.feeBps === "bigint" ? params.feeBps : BigInt(params.feeBps);

  // 1) Simulate with the public client (binds the correct types/accounts/chain)
  const { request } = await publicClient.simulateContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: "createSongToken",
    args: [params.name, params.symbol, params.treasury, feeBps],
    account: walletClient.account, // important for types
  });

  // 2) Write using the wallet client with the simulated request
  const hash = await walletClient.writeContract(request);
  return hash;
}

// If you need factory reads:
export function factoryDeployTokenStatic(args: {
  name: string; symbol: string; treasury: Address; feeBps: number | bigint;
}) {
  const feeBps = typeof args.feeBps === "bigint" ? args.feeBps : BigInt(args.feeBps);
  return publicClient.simulateContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: "deployToken",
    args: [args.name, args.symbol, args.treasury, feeBps],
  });
}
