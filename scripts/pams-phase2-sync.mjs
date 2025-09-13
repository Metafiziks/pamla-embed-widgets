// scripts/pams-phase2-sync.mjs
// Run with: node scripts/pams-phase2-sync.mjs

import 'dotenv/config'
import { createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { abstractSepolia } from '../lib/chain-abstract.js'
import { SongTokenRegistryABI, AccessControllerABI, ERC721ABI } from '../lib/abi.js'

/** ========== ENV ========== */
const {
  // mainnet data source for PaMs holders
  ETHERSCAN_API_KEY,

  // contracts
  NEXT_PUBLIC_PAMS_NFT,          // PaMs ERC-721 (mainnet)
  NEXT_PUBLIC_ACCESS_CONTROLLER,  // ACL on Abstract Sepolia
  REGISTRY_ADDRESS,               // ✅ SongTokenRegistry on Abstract Sepolia

  // Abstract RPC + signer
  RPC_URL,                        // Abstract Sepolia RPC (e.g. https://api.testnet.abs.xyz)
  ADMIN_PRIVATE_KEY,              // has ACL_OWNER perms OR Registry owner

  // optional verification & tuning
  NEXT_PUBLIC_MAINNET_RPC,       // mainnet RPC (Infura/Alchemy) for balanceOf verification
  VERIFY_BALANCE = 'true',       // "true"/"false" — verify with balanceOf (recommended)
  BATCH_SIZE = '200',            // how many addresses per allowlist tx
  PAGE_SIZE = '1000',            // etherscan page size (max 1000)
  SLEEP_MS = '250'               // pause between etherscan pages to be nice
} = process.env

function requireEnv(name, val) {
  if (!val || String(val).trim() === '') {
    throw new Error(`❌ Missing env var: ${name}`)
  }
}

requireEnv('ETHERSCAN_API_KEY', ETHERSCAN_API_KEY)
requireEnv('NEXT_PUBLIC_PAMS_NFT', NEXT_PUBLIC_PAMS_NFT)
requireEnv('NEXT_PUBLIC_ACCESS_CONTROLLER', NEXT_PUBLIC_ACCESS_CONTROLLER)
requireEnv('REGISTRY_ADDRESS', REGISTRY_ADDRESS)
requireEnv('RPC_URL', RPC_URL)
requireEnv('ADMIN_PRIVATE_KEY', ADMIN_PRIVATE_KEY)

// signer on Abstract Sepolia
const account = privateKeyToAccount(ADMIN_PRIVATE_KEY)
const abs = createWalletClient({ account, chain: abstractSepolia, transport: http(RPC_URL) })
const absReader = createPublicClient({ chain: abstractSepolia, transport: http(RPC_URL) })

// optional mainnet client to verify balanceOf
let mainnetReader = null
if (VERIFY_BALANCE === 'true') {
  requireEnv('NEXT_PUBLIC_MAINNET_RPC', NEXT_PUBLIC_MAINNET_RPC)
  mainnetReader = createPublicClient({ chain: { id: 1, name: 'mainnet', nativeCurrency: { name:'ETH', symbol:'ETH', decimals:18 }, rpcUrls: { default: { http: [NEXT_PUBLIC_MAINNET_RPC] } } }, transport: http(NEXT_PUBLIC_MAINNET_RPC) })
}

const BATCH = Number(BATCH_SIZE)
const PAGE = Number(PAGE_SIZE)
const PAUSE = Number(SLEEP_MS)

const sleep = (ms) => new Promise(res => setTimeout(res, ms))

/** Fetch all current holder addresses from Etherscan (paged) */
async function getAllEtherscanHolders() {
  let page = 1
  const out = new Set()

  // Etherscan tokenholderlist returns up to 1000 per page
  while (true) {
    const url = `https://api.etherscan.io/api?module=token&action=tokenholderlist&contractaddress=${NEXT_PUBLIC_PAMS_NFT}&page=${page}&offset=${PAGE}&apikey=${ETHERSCAN_API_KEY}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`)
    const json = await res.json()
    if (json.status !== '1') {
      // If no more pages, Etherscan returns status "0" + message "No data found"
      if (json.message?.toLowerCase().includes('no data')) break
      throw new Error(`Etherscan error (page ${page}): ${json.message || json.result}`)
    }

    const list = json.result || []
    if (list.length === 0) break

    for (const row of list) {
      const addr = row.TokenHolderAddress
      if (addr && addr !== '0x0000000000000000000000000000000000000000') out.add(addr)
    }

    console.log(`→ Page ${page}: got ${list.length} holders (total so far ${out.size})`)
    page += 1
    await sleep(PAUSE) // be gentle with the API
  }

  return [...out]
}

/** Optionally verify each address still holds at least 1 PaMs (avoid stale sellers) */
async function filterCurrentHolders(addresses) {
  if (!mainnetReader) return addresses
  console.log(`→ Verifying current balances via balanceOf() on mainnet…`)
  const verified = []
  for (let i = 0; i < addresses.length; i++) {
    const who = addresses[i]
    try {
      const bal = await mainnetReader.readContract({
        address: NEXT_PUBLIC_PAMS_NFT,
        abi: ERC721ABI,
        functionName: 'balanceOf',
        args: [who]
      })
      if ((bal ?? 0n) > 0n) verified.push(who)
    } catch (e) {
      // if call fails, just skip this address
    }
    // light throttle to avoid RPC bans
    if (i % 50 === 0) await sleep(50)
  }
  console.log(`→ ${verified.length}/${addresses.length} still hold PaMs`)
  return verified
}

/** Batch a large array */
function chunk(arr, n) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

async function main() {
  console.log('== PaMs → ACL allowlist sync (via Etherscan), then set phase=2 ==')

  // 0) Confirm ACL owner/permissions (optional but nice)
  try {
    const owner = await absReader.readContract({
      address: NEXT_PUBLIC_ACCESS_CONTROLLER,
      abi: AccessControllerABI,
      functionName: 'owner',
      args: []
    })
    console.log(`ACL owner: ${owner}`)
  } catch {
    console.log('⚠️ Could not read ACL owner (non-fatal)')
  }

  // 1) Fetch holders
  const raw = await getAllEtherscanHolders()
  if (raw.length === 0) {
    console.log('⚠️ No PaMs holders found. Aborting.')
    return
  }
  console.log(`→ Found ${raw.length} PaMs holder addresses (raw)`)

  // 2) Optional: verify still holders
  const holders = await filterCurrentHolders(raw)
  if (holders.length === 0) {
    console.log('⚠️ After verification, no current holders. Aborting.')
    return
  }

  // 3) Forward allowlist via the Registry helper (batches)
  const batches = chunk(holders, BATCH)
  console.log(`→ Forwarding ${holders.length} allowlist entries in ${batches.length} txs (batch=${BATCH})`)
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    console.log(`   • Tx ${i + 1}/${batches.length} for ${batch.length} addrs`)
    await abs.writeContract({
      address: REGISTRY_ADDRESS,
      abi: SongTokenRegistryABI,
      functionName: 'forwardAllowlist',
      args: [NEXT_PUBLIC_ACCESS_CONTROLLER, batch, true],
    })
    await sleep(250) // tiny gap between writes
  }

  // 4) Set phase = 2 (PaMs OR allowlisted)
  console.log('→ Setting phase=2')
  await abs.writeContract({
    address: REGISTRY_ADDRESS,
    abi: SongTokenRegistryABI,
    functionName: 'forwardSetPhase',
    args: [NEXT_PUBLIC_ACCESS_CONTROLLER, 2],
  })

  console.log('🎉 PaMs imported + Phase set to 2')
}

main().catch(err => {
  console.error('❌ Error', err)
  process.exit(1)
})
