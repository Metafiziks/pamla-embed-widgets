import { NextRequest, NextResponse } from 'next/server'
import { createWalletClient, http, isAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { AccessControllerABI } from '../../../../../lib/abi'
import { abstractSepolia } from '../../../../../lib/wagmi'

const RPC_URL = process.env.RPC_URL || 'https://api.testnet.abs.xyz'
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY
const CHAIN_ID = Number(process.env.CHAIN_ID || '11124')

export async function POST(req: NextRequest) {
  try {
    if (!ADMIN_PRIVATE_KEY) return NextResponse.json({ error: 'Server missing ADMIN_PRIVATE_KEY' }, { status: 500 })
    const { acl, addresses, allow } = await req.json()

    if (!isAddress(acl)) return NextResponse.json({ error: 'Bad ACL address' }, { status: 400 })
    if (!Array.isArray(addresses) || addresses.length === 0) return NextResponse.json({ error: 'No addresses' }, { status: 400 })

    const valid = addresses.filter((a:string)=>isAddress(a))
    if (valid.length === 0) return NextResponse.json({ error: 'No valid addresses' }, { status: 400 })

    const account = privateKeyToAccount(ADMIN_PRIVATE_KEY as `0x${string}`)
    const wallet = createWalletClient({ account, chain: abstractSepolia, transport: http(RPC_URL) })

    const chunkSize = 150
    const chunks:string[][] = []
    for (let i=0;i<valid.length;i+=chunkSize) chunks.push(valid.slice(i,i+chunkSize))

    let firstHash: `0x${string}` | undefined
    for (const chunk of chunks) {
      const hash = await wallet.writeContract({
        address: acl,
        abi: AccessControllerABI,
        functionName: 'setAllowlistBatch',
        args: [chunk, allow],
      })
      if (!firstHash) firstHash = hash
    }

    return NextResponse.json({ ok: true, txCount: chunks.length, firstHash })
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 })
  }
}
