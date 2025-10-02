// lib/viem.ts
import { createPublicClient, http, defineChain } from 'viem'

export const absTestnet = defineChain({
  id: 11124,
  name: 'ABS Testnet',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default:   { http: [process.env.NEXT_PUBLIC_RPC_URL ?? 'https://api.testnet.abs.xyz'] },
    public:    { http: [process.env.NEXT_PUBLIC_RPC_URL ?? 'https://api.testnet.abs.xyz'] },
  },
})

export const publicClient = createPublicClient({
  chain: absTestnet,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL ?? 'https://api.testnet.abs.xyz'),
})
