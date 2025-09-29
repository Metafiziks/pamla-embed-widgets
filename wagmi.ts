// /lib/wagmi.ts
import { createConfig, http } from 'wagmi';
import { defineChain } from 'viem';

// Read from your env (these are the ones you’ve been using)
const RPC = process.env.NEXT_PUBLIC_ABSTRACT_RPC!;
const ID = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN ?? 11124);

export const abstractSepolia = defineChain({
  id: ID,
  name: 'Abstract Sepolia',
  network: 'abstract-sepolia',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [RPC] },
    public: { http: [RPC] },
  },
  blockExplorers: {
    default: { name: 'AbstractScan', url: 'https://sepolia.abscan.org' },
  },
});

// This is what providers.tsx expects
export const config = createConfig({
  chains: [abstractSepolia],
  transports: {
    [abstractSepolia.id]: http(RPC),
  },
  autoConnect: false, // prevents auto wallet popup
});

export type AppChain = typeof abstractSepolia;
