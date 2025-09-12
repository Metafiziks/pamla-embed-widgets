import { NextRequest, NextResponse } from 'next/server'
import { createWalletClient, http, isAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { AccessControllerABI } from '../../../../lib/abi'
import { abstractSepolia } from '../../../../lib/wagmi'

const RPC_URL = process.env.RPC_URL || 'https://api.testnet.abs.xyz'
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY // must be 0x-prefixed
const CHAIN_ID = Number(process.env.CHAIN_ID || '11124')

export async function POST(req: NextRequest) {
  try {
    if (!ADMIN_PRIVATE_KEY) {
      return NextResponse.json({ error: 'Server missing ADMIN_PRIVATE_KEY' }, { status: 500 })
    }

    const body = await req.json()
    const acl = body?.acl as string
    const addresses = (body?.addresses as string[]) || []
    const allow = !!body?.allow

    if (!isAddress(acl)) {
      return NextResponse.json({ error: 'Bad ACL address' }, { status: 400 })
    }
    if (!Array.isArray(addresses) || addresses.length === 0) {
      return NextResponse.json({ error: 'No addresses' }, { status: 400 })
    }

    // Filter to valid 0x addresses
    const valid = addresses.filter((a) => isAddress(a)) as `0x${string}`[]
    if (valid.length === 0) {
      return NextResponse.json({ error: 'No valid addresses' }, { status: 400 })
    }

    // Create signer (burner/admin)
    const account = privateKeyToAccount(ADMIN_PRIVATE_KEY as `0x${string}`)
    const wallet = createWalletClient({
      account,
      chain: abstractSepolia,
      transport: http(RPC_URL),
    })

    // Chunk to avoid block gas limits
    const chunkSize = 150
    const chunks: (`0x${string}`[])[] = []
    for (let i = 0; i < valid.length; i += chunkSize) {
      chunks.push(valid.slice(i, i + chunkSize))
    }

    let firstHash: `0x${string}` | undefined
    for (const chunk of chunks) {
      // viem wants readonly `0x${string}`[]
      const typed = chunk as readonly `0x${string}`[]

      const hash = await wallet.writeContract({
        account,
        chain: abstractSepolia,
        address: acl as `0x${string}`,
        abi: AccessControllerABI,
        functionName: 'setAllowlistBatch',
        args: [typed, allow],
      })

      if (!firstHash) {
        firstHash = hash
      }
    }

    return NextResponse.json({ ok: true, txCount: chunks.length, firstHash })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 })
  }
}
