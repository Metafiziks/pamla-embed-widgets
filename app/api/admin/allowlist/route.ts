// app/api/admin/allowlist/route.ts
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

// ⚠️ Use relative imports to avoid path alias issues in build
import { AccessControllerABI } from '../../../lib/abi'

// Ensure Node runtime (Edge lacks some crypto/node APIs we need)
export const runtime = 'nodejs'
// Avoid any attempt to prerender this route
export const dynamic = 'force-dynamic'

// ------------ Config ------------
const RPC_URL = process.env.RPC_URL || 'https://api.testnet.abs.xyz'
const CHAIN_ID = Number(process.env.CHAIN_ID || 11124)
// Allowed origins (add your Hostinger domain if different)
const ALLOWED_ORIGINS = new Set(['http://localhost:3000', 'https://soniqute.com'])
// Simple in-memory rate limit (per-IP)
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10
const ipMap = new Map<string, { count: number; first: number }>()

// Minimal chain object for viem
const chain = { id: CHAIN_ID, name: 'abstract-sepolia', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } } as const

function isHexAddress(x: unknown): x is `0x${string}` {
  return typeof x === 'string' && /^0x[0-9a-fA-F]{40}$/.test(x)
}

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function POST(req: NextRequest) {
  // --- Origin pinning ---
  const origin = req.headers.get('origin') || ''
  if (!ALLOWED_ORIGINS.has(origin)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 })
  }

  // --- Rate limiting ---
  const ip = req.headers.get('x-forwarded-for') || 'unknown'
  const now = Date.now()
  const rec = ipMap.get(ip) || { count: 0, first: now }
  if (now - rec.first < RATE_LIMIT_WINDOW_MS) {
    if (rec.count >= RATE_LIMIT_MAX) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }
    rec.count++
  } else {
    rec.count = 1
    rec.first = now
  }
  ipMap.set(ip, rec)

  try {
    // --- Parse & validate body ---
    const body = await req.json()
    const { addresses, allow, acl } = body ?? {}

    if (!isHexAddress(acl)) {
      return NextResponse.json({ error: 'Invalid ACL address' }, { status: 400 })
    }
    if (!Array.isArray(addresses) || addresses.length === 0) {
      return NextResponse.json({ error: 'addresses must be a non-empty array' }, { status: 400 })
    }
    const valid = addresses.filter(isHexAddress) as readonly `0x${string}`[]
    if (valid.length === 0) {
      return NextResponse.json({ error: 'No valid addresses' }, { status: 400 })
    }
    const allowBool = Boolean(allow)

    // --- Wallet client (server-side) ---
    const pk = process.env.ADMIN_PRIVATE_KEY
    if (!pk || !pk.startsWith('0x')) {
      return NextResponse.json({ error: 'Missing ADMIN_PRIVATE_KEY (0x-prefixed) in env' }, { status: 500 })
    }
    const account = privateKeyToAccount(pk as `0x${string}`)
    const wallet = createWalletClient({ account, chain, transport: http(RPC_URL) })

    // --- Send in chunks ---
    const batches = chunk(valid, 50)
    let firstHash: `0x${string}` | undefined

    for (const batch of batches) {
      const { hash } = await wallet.writeContract({
        address: acl,
        abi: AccessControllerABI,
        functionName: 'setAllowlistBatch',
        args: [batch, allowBool],
      })
      if (!firstHash) firstHash = hash
    }

    return NextResponse.json({ ok: true, txCount: batches.length, firstHash })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 })
  }
}
