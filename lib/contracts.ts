// lib/contracts.ts
import { getContract } from "viem";
import { publicClient } from "./viem";

import RegistryAbi from "./abi/SongTokenRegistry.json";
import FactoryAbi from "./abi/BondingCurveFactory.json";

// Helper to grab env or throw a clear error
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const ADDRESSES = {
  REGISTRY: requireEnv("NEXT_PUBLIC_REGISTRY") as `0x${string}`,
  FACTORY: requireEnv("NEXT_PUBLIC_FACTORY") as `0x${string}`,
};

export const registry = getContract({
  address: ADDRESSES.REGISTRY,
  abi: (RegistryAbi as any).abi ?? RegistryAbi,
  client: { public: publicClient },
});

export const factory = getContract({
  address: ADDRESSES.FACTORY,
  abi: (FactoryAbi as any).abi ?? FactoryAbi,
  client: { public: publicClient },
});
