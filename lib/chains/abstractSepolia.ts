import { defineChain } from 'viem';

const RPC = process.env.NEXT_PUBLIC_ABSTRACT_RPC!;
const ID = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN ?? 11124);

export const abstractSepolia = defineChain({
  id: ID,
  name: 'Abstract Sepolia',
  network: 'abstract-sepolia',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [RPC] },
    public:  { http: [RPC] },
  },
  // optional but nice:
  blockExplorers: {
    default: { name: 'AbstractScan', url: 'https://sepolia.abscan.org' },
  },
});