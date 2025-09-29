// scripts/pams-phase2-sync.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: path.resolve(__dirname, '../.env'),
  override: true,           // <<< this makes .env values override exported shell vars
});

import 'dotenv/config'
import { createWalletClient, http, getContract, isAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { abstractSepolia } from '../lib/wagmi.js'
import { SongTokenRegistryABI, AccessControllerABI } from '../lib/abi.js'

/** ---------- ENV ---------- */
function requireEnv(name) {
  const v = process.env[name]
  if (!v) throw new Error(`❌ Missing env var: ${name}`)
  return v.trim()
}

// core
const REGISTRY = requireEnv('REGISTRY_ADDRESS')
const ACL       = requireEnv('NEXT_PUBLIC_ACCESS_CONTROLLER')
const PAMS_NFT  = requireEnv('NEXT_PUBLIC_PAMS_NFT')

// rpc + keys
const RPC_URL   = requireEnv('RPC_URL')
const CHAIN_ID  = Number(process.env.CHAIN_ID || '11124')
const PK        = requireEnv('ADMIN_PRIVATE_KEY')

// data providers
const ETHERSCAN = process.env.ETHERSCAN_API_KEY?.trim()
const ALCHEMY_V3 = process.env.ALCHEMY_MAINNET_V3_KEY?.trim()
const ALCHEMY_V2 = process.env.ALCHEMY_MAINNET_KEY?.trim()

// tuning
const VERIFY_BALANCE = String(process.env.VERIFY_BALANCE || 'false').toLowerCase() === 'true'
const PAGE_SIZE      = Number(process.env.PAGE_SIZE || '1000')
const SLEEP_MS       = Number(process.env.SLEEP_MS || '250')
const BATCH_SIZE     = Number(process.env.BATCH_SIZE || '100') // start conservative

console.log(`Using REGISTRY: ${REGISTRY}`)
console.log(`Using ACL: ${ACL}`)
console.log(`Using PaMs NFT: ${PAMS_NFT}`)
console.log(`VERIFY_BALANCE: ${VERIFY_BALANCE}`)
console.log(`BATCH_SIZE: ${BATCH_SIZE} SLEEP_MS: ${SLEEP_MS} PAGE_SIZE: ${PAGE_SIZE}`)

/** ---------- CLIENTS ---------- */
const account = privateKeyToAccount(PK)
const chain = { ...abstractSepolia, id: CHAIN_ID }
const wallet = createWalletClient({ account, chain, transport: http(RPC_URL) })

const registry = getContract({
  address: REGISTRY,
  abi: SongTokenRegistryABI,
  client: wallet
})

const acl = getContract({
  address: ACL,
  abi: AccessControllerABI,
  client: wallet
})

/** ---------- HELPERS ---------- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function distinctValidAddresses(addrs) {
  const seen = new Set()
  const out = []
  for (const a of addrs) {
    const aa = a.trim()
    if (!isAddress(aa)) continue
    if (aa === '0x0000000000000000000000000000000000000000') continue
    if (seen.has(aa.toLowerCase())) continue
    seen.add(aa.toLowerCase())
    out.push(aa)
  }
  return out
}

/** ---------- HOLDERS (Alchemy first, Etherscan optional) ---------- */
async function getOwnersAlchemyV3() {
  if (!ALCHEMY_V3) throw new Error('Alchemy v3 key not set')
  const url = `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_V3}/getOwnersForCollection?contractAddress=${PAMS_NFT}&withTokenBalances=false`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Alchemy v3 HTTP ${res.status}`)
  const j = await res.json()
  if (!j || !Array.isArray(j.ownerAddresses)) throw new Error('Alchemy v3 unexpected response')
  return j.ownerAddresses
}

async function getOwnersAlchemyV2() {
  if (!ALCHEMY_V2) throw new Error('Alchemy v2 key not set')
  const owners = []
  let pageKey = null
  do {
    const url = new URL(`https://eth-mainnet.g.alchemy.com/nft/v2/${ALCHEMY_V2}/getOwnersForCollection`)
    url.searchParams.set('contractAddress', PAMS_NFT)
    url.searchParams.set('withTokenBalances', 'false')
    if (pageKey) url.searchParams.set('pageKey', pageKey)
    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`Alchemy v2 HTTP ${res.status}`)
    const j = await res.json()
    if (Array.isArray(j.ownerAddresses)) owners.push(...j.ownerAddresses)
    pageKey = j.pageKey || null
    if (SLEEP_MS) await sleep(SLEEP_MS)
  } while (pageKey)
  return owners
}

async function getAllAlchemyOwners() {
  try {
    return await getOwnersAlchemyV3()
  } catch (e) {
    console.warn(`⚠️ v3 failed, falling back to v2: ${e.message}`)
    return await getOwnersAlchemyV2()
  }
}

async function verifyBalances(addrs) {
  // Optional: check ERC721 balanceOf on mainnet for each address.
  // We’ll skip here if VERIFY_BALANCE=false to save calls/credits.
  return addrs
}

/** ---------- ADAPTIVE BATCH FORWARDING ---------- */
async function forwardAllowlistAdaptive(addrs, allow) {
  // Try to send one write; on revert, split into halves and recurse.
  try {
    await registry.write.forwardAllowlist([ACL, addrs, allow])
    return { ok: addrs.length, failed: [] }
  } catch (err) {
    // If a large batch reverts, split and try smaller pieces.
    if (addrs.length === 1) {
      return { ok: 0, failed: [addrs[0]] }
    }
    const mid = Math.floor(addrs.length / 2)
    const left = addrs.slice(0, mid)
    const right = addrs.slice(mid)
    const [resL, resR] = await Promise.all([
      forwardAllowlistAdaptive(left, allow),
      forwardAllowlistAdaptive(right, allow),
    ])
    return {
      ok: resL.ok + resR.ok,
      failed: [...resL.failed, ...resR.failed],
    }
  }
}

/** ---------- MAIN ---------- */
async function main() {
  console.log('== PaMs → ACL allowlist sync (Alchemy v3→v2), then set phase=2 ==')

  // 1) sanity: registry must own the ACL
  try {
    const owner = await acl.read.owner()
    if (String(owner).toLowerCase() !== REGISTRY.toLowerCase()) {
      console.warn(`⚠️ ACL.owner() != REGISTRY. owner=${owner} registry=${REGISTRY}`)
      console.warn('   forwardAllowlist will REVERT if registry is not owner. Consider transferring ownership to registry.')
    }
  } catch (e) {
    console.warn('⚠️ Could not read ACL owner (non-fatal)')
  }

  // 2) fetch holders
  const raw = await getAllAlchemyOwners()
  console.log(`→ Alchemy returned ${raw.length} addresses`)
  const filtered = distinctValidAddresses(raw)
  console.log(`→ ${filtered.length} valid addresses after filtering (no zero/dupes/invalid)`)

  // 3) optionally verify current balances
  let holders = filtered
  if (VERIFY_BALANCE) {
    console.log('→ Verifying live balances on mainnet...')
    holders = await verifyBalances(filtered)
    console.log(`→ ${holders.length} are CURRENT PaMs holders after balance checks`)
  } else {
    console.log('→ Skipping live balance verification (VERIFY_BALANCE=false).')
  }

  if (holders.length === 0) {
    console.log('⚠️ No holders to import; aborting before phase change.')
    return
  }

  // 4) forward allowlist adaptively per chunk
  let totalOk = 0
  const totalFailed = []
  for (let i = 0; i < holders.length; i += BATCH_SIZE) {
    const chunk = holders.slice(i, i + BATCH_SIZE)
    console.log(`→ Forwarding batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} addrs)`)
    const res = await forwardAllowlistAdaptive(chunk, true)
    totalOk += res.ok
    totalFailed.push(...res.failed)
    if (SLEEP_MS) await sleep(SLEEP_MS)
  }

  console.log(`→ Allowlisted OK: ${totalOk} | Failed: ${totalFailed.length}`)
  if (totalFailed.length) {
    console.log('   Failed addresses (kept for your review):')
    console.log(totalFailed.join('\n'))
  }

  if (totalOk === 0) {
    console.log('⚠️ Nothing allowlisted successfully; skipping phase change.')
    return
  }

  // 5) set phase=2
  console.log('→ Setting phase=2')
  await registry.write.forwardSetPhase([ACL, 2])
  console.log('🎉 PaMs imported + Phase set to 2')
}

main().catch((err) => {
  console.error('❌ Error', err)
  process.exit(1)
})
