// /lib/env.ts
function required(name: string, value: string | undefined) {
  if (!value || value.trim() === '') throw new Error(`Missing required env var: ${name}`)
  return value
}

/**
 * Unified env for both server & client.
 * We first try NEXT_PUBLIC_* (client bundle), then fall back to server-only names.
 */
export const env = {
  // RPC used for your testnet/app chain (Abstract testnet, etc.)
  RPC_URL: required(
    'NEXT_PUBLIC_RPC_URL or RPC_URL',
    process.env.NEXT_PUBLIC_RPC_URL ?? process.env.RPC_URL
  ),

  // Mainnet RPC (for PaMs/allowlist reads in the client)
  MAINNET_RPC_URL: required(
    'NEXT_PUBLIC_MAINNET_RPC_URL or MAINNET_RPC_URL',
    process.env.NEXT_PUBLIC_MAINNET_RPC_URL ?? process.env.MAINNET_RPC_URL
  ),

  // Chain id for the app chain
  CHAIN_ID: Number(
    required('NEXT_PUBLIC_CHAIN_ID or CHAIN_ID', (process.env.NEXT_PUBLIC_CHAIN_ID ?? process.env.CHAIN_ID) as string)
  ),
}
