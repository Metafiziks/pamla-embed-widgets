// scripts/pams-phase2-sync.mjs
// Usage: node scripts/pams-phase2-sync.mjs
// Reads all current PaMs holders on Ethereum mainnet, confirms balance>0,
// then adds them to ACL allowlist on Abstract Sepolia, THEN sets phase=2.
//
// ⚠️ Requires env vars (see below).

import { createPublicClient, createWalletClient, http, isAddress, getAddress } from 'viem'
import { mainnet } from 'viem/chains'

// Minimal Abstract Sepolia chain
const abstractSepolia = {
  id: 11124,
  name: 'abstract-sepolia',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://api.testnet.abs.xyz'] } },
}

// --- ENV ---
const {
  // mainnet (for PaMs)
  MAINNET_RPC_URL,
  PAMS_NFT, // PaMs ERC-721 on ETH mainnet

  // abstract
  RPC_URL, // Abstract Sepolia RPC
  CHAIN_ID = '11124',
  ACCESS_CONTROLLER, // ACL address on Abstract
  ADMIN_PRIVATE_KEY, // burner/admin with ACL perms (same as your /admin-allowlist api key)

  // optional
  TRANSFER_LOOKBACK = '100000', // how many blocks back to scan PaMs transfers
} = process.env

function req(name, v) {
  if (!v) { console.error(`Missing required env: ${name}`); process.exit(1) }
  return v
}
req('MAINNET_RPC_URL', MAINNET_RPC_URL)
req('PAMS_NFT', PAMS_NFT)
req('RPC_URL', RPC_URL)
req('ACCESS_CONTROLLER', ACCESS_CONTROLLER)
req('ADMIN_PRIVATE_KEY', ADMIN_PRIVATE_KEY)

const AccessControllerABI = [
  { type:'function', name:'setAllowlistBatch', stateMutability:'nonpayable',
    inputs:[{name:'accts', type:'address[]'},{name:'allow', type:'bool'}], outputs:[] },
  { type:'function', name:'setPhase', stateMutability:'nonpayable',
    inputs:[{name:'p', type:'uint8'}], outputs:[] },
  { type:'function', name:'getPhase', stateMutability:'view',
    inputs:[], outputs:[{type:'uint8'}] },
  { type:'function', name:'isAllowlisted', stateMutability:'view',
    inputs:[{name:'a', type:'address'}], outputs:[{type:'bool'}] },
]

// Minimal ERC-721 ABI
const ERC721ABI = [
  { type:'function', name:'balanceOf', stateMutability:'view',
    inputs:[{name:'owner', type:'address'}], outputs:[{type:'uint256'}] },
  { type:'event', name:'Transfer', inputs:[
    { indexed:true, name:'from', type:'address' },
    { indexed:true, name:'to', type:'address' },
    { indexed:false, name:'tokenId', type:'uint256' },
  ]}
]

function uniq(arr) { return [...new Set(arr)] }

async function main() {
  console.log('== PaMs → ACL allowlist sync, then set phase=2 ==')

  // Clients
  const eth = createPublicClient({ chain: mainnet, transport: http(MAINNET_RPC_URL) })
  const absPub = createPublicClient({ chain: abstractSepolia, transport: http(RPC_URL) })
  const absWallet = createWalletClient({
    chain: abstractSepolia,
    transport: http(RPC_URL),
    account: (await import('viem/accounts')).privateKeyToAccount(ADMIN_PRIVATE_KEY),
  })

  const acl = getAddress(ACCESS_CONTROLLER)
  const pams = getAddress(PAMS_NFT)

  // Discover recent holders from PaMs Transfer logs
  const latest = await eth.getBlockNumber()
  const fromBlock = latest - BigInt(TRANSFER_LOOKBACK)
  console.log(`Scanning PaMs transfers from block ${fromBlock} to ${latest}...`)
  const logs = await eth.getLogs({
    address: pams,
    event: ERC721ABI[1], // Transfer
    fromBlock,
    toBlock: latest,
  })

  const candidates = new Set()
  for (const lg of logs) {
    const args = (lg).args || {}
    const to = args.to
    // ignore mint/burn zero
    if (to && to.toLowerCase() !== '0x0000000000000000000000000000000000000000') {
      if (isAddress(to)) candidates.add(getAddress(to))
    }
  }
  const rough = uniq([...candidates])
  console.log(`Found ${rough.length} recent receivers; confirming balanceOf > 0...`)

  // Confirm balance > 0 to avoid stale receivers who no longer hold
  const holders = []
  for (const addr of rough) {
    try {
      const bal = await eth.readContract({
        address: pams,
        abi: ERC721ABI,
        functionName: 'balanceOf',
        args: [addr],
      })
      if (bal && BigInt(bal) > 0n) holders.push(addr)
    } catch {}
  }
  console.log(`Confirmed ${holders.length} current PaMs holders`)

  if (!holders.length) {
    console.log('No holders found; skipping allowlist update, setting phase=2 anyway...')
  } else {
    // Chunk and call setAllowlistBatch
    const chunkSize = 400
    let txCount = 0
    for (let i=0; i<holders.length; i+=chunkSize) {
      const batch = holders.slice(i, i+chunkSize)
      const txHash = await absWallet.writeContract({
        address: acl,
        abi: AccessControllerABI,
        functionName: 'setAllowlistBatch',
        args: [batch, true],
        chain: abstractSepolia,
      })
      txCount++
      console.log(`Allowlisted batch ${txCount} (size ${batch.length}): ${txHash}`)
    }
  }

  // Set phase = 2 (PaMs OR allowlist, achieved via allowlisting PaMs)
  const setPhaseTx = await absWallet.writeContract({
    address: acl,
    abi: AccessControllerABI,
    functionName: 'setPhase',
    args: [2],
    chain: abstractSepolia,
  })
  console.log(`Phase set to 2: ${setPhaseTx}`)
  console.log('🎉 Done. Phase 2 now effectively “PaMs OR Allowlist”.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
