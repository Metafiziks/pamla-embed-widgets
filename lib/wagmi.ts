// import { injected } from '@wagmi/connectors'
import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'    // ✅ use wagmi/connectors
import type { Chain } from 'viem'
import { createConfig, http } from 'wagmi';
// Use whichever chain file you kept:
import { abstractSepolia } from '@/lib/chains/abstractSepolia';

const RPC = process.env.NEXT_PUBLIC_ABSTRACT_RPC!;
export const wagmiConfig = createConfig({
  chains: [abstractSepolia],
  transports: {
    [abstractSepolia.id]: http(RPC),
  },
});

export const abstractSepolia: Chain = {
  id: 11124,
  name: 'Abstract Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://api.testnet.abs.xyz'] } },
  blockExplorers: { default: { name: 'Abstract Scan', url: 'https://explorer.sepolia.abs.xyz' } },
}

