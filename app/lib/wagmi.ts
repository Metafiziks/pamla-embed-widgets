// app/lib/wagmi.ts
import { http } from 'viem'
import { WagmiProvider, createConfig } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

export const abstractSepolia = {
  id: 11124,
  name: 'Abstract Sepolia',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_ABSTRACT_RPC || 'https://api.testnet.abs.xyz'] } },
} as const

// Wagmi v2-style config
export const config = createConfig({
  chains: [abstractSepolia],
  connectors: [injected()],
  transports: {
    [abstractSepolia.id]: http(process.env.NEXT_PUBLIC_ABSTRACT_RPC || 'https://api.testnet.abs.xyz'),
  },
})

// Simple Providers wrapper used by the embed layout
const queryClient = new QueryClient()
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
