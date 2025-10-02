// pamla-embed-widgets/lib/contracts.ts
import { createPublicClient, http, getContract, type Address } from 'viem';
import RegistryAbi from './abi/SongTokenRegistry.json';
import FactoryAbi from './abi/BondingCurveFactory.json';
import TokenAbi from './abi/BondingCurveToken.json';
import { ADDRESSES } from './addresses';

// TODO: replace with your actual chain (chainId 11124)
const chain = {
  id: 11124,
  name: 'Abstract Testnet',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL!] } },
} as const;

export const client = createPublicClient({
  chain,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
});

// static instances (fixed addresses)
export const registry = getContract({
  address: ADDRESSES.REGISTRY,
  abi: (RegistryAbi as any).abi ?? RegistryAbi,
  publicClient,
});

export const factory = getContract({
  address: ADDRESSES.FACTORY,
  abi: (FactoryAbi as any).abi ?? FactoryAbi,
  publicClient,
});

// per-song token (dynamic address)
export function tokenAt(address: Address) {
  return getContract({
    address,
    abi: (TokenAbi as any).abi ?? TokenAbi,
    client,
  });
}
