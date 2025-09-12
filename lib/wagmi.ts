// import { injected } from '@wagmi/connectors'
import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'    // ✅ use wagmi/connectors
import type { Chain } from 'viem'

export const abstractSepolia: Chain = {
  id: 11124,
  name: 'Abstract Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://api.testnet.abs.xyz'] } },
  blockExplorers: { default: { name: 'Abstract Scan', url: 'https://explorer.sepolia.abs.xyz' } },
}

export const config = createConfig({
  chains: [abstractSepolia],
  connectors: [injected()],                     // ✅ fine now
  transports: {
    [abstractSepolia.id]: http(process.env.NEXT_PUBLIC_ABSTRACT_RPC || 'https://api.testnet.abs.xyz'),
  },
})
