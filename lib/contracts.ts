// lib/contracts.ts
import { getContract } from "viem";
import { publicClient, walletClient } from "./viem";

import RegistryAbi from "./abi/SongTokenRegistry.json";
import FactoryAbi from "./abi/BondingCurveFactory.json";

export const ADDRESSES = {
  REGISTRY: mustEnv("NEXT_PUBLIC_REGISTRY") as `0x${string}`,
  FACTORY: mustEnv("NEXT_PUBLIC_FACTORY") as `0x${string}`,
};

// For read-only calls
export const registry = getContract({
  address: ADDRESSES.REGISTRY as `0x${string}`,
  abi: (RegistryAbi as any).abi ?? RegistryAbi,
  client: { public: publicClient },
});

export const factory = getContract({
  address: ADDRESSES.FACTORY as `0x${string}`,
  abi: (FactoryAbi as any).abi ?? FactoryAbi,
  client: { public: publicClient },
});

// If you need writes (transactions), wrap with wallet client
export const registryWrite = walletClient
  ? getContract({
      address: ADDRESSES.REGISTRY as `0x${string}`,
      abi: (RegistryAbi as any).abi ?? RegistryAbi,
      client: { wallet: walletClient },
    })
  : null;

export const factoryWrite = walletClient
  ? getContract({
      address: ADDRESSES.FACTORY as `0x${string}`,
      abi: (FactoryAbi as any).abi ?? FactoryAbi,
      client: { wallet: walletClient },
    })
  : null;
