// /lib/viem.ts
import { createPublicClient, http, defineChain } from 'viem'
import { env } from './env'

// Define a minimal chain object from provided CHAIN_ID/RPC_URL
const appChain = defineChain({
  id: env.CHAIN_ID,
  name: 'AppChain',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [env.RPC_URL] },
    public: { http: [env.RPC_URL] },
  },
})

export const publicClient = createPublicClient({
  chain: appChain,
  transport: http(env.RPC_URL),
})

// Optional: a public client for mainnet reads (PaMs/whitelist)
export const mainnetPublicClient = createPublicClient({
  chain: defineChain({
    id: 1,
    name: 'Ethereum',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: { http: [env.MAINNET_RPC_URL] },
      public: { http: [env.MAINNET_RPC_URL] },
    },
  }),
  transport: http(env.MAINNET_RPC_URL),
})
