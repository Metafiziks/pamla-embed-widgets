'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAccount, useConnect } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { parseEther, createPublicClient, createWalletClient, http, custom, type Abi } from 'viem'
import { abstractSepolia } from '@/lib/wagmi'

import TokenJson from '@/lib/abi/BondingCurveToken.json'
const TokenABI = TokenJson.abi as Abi

import AccessControllerJson from '@/lib/abi/AccessController.json'
const ACLABI = AccessControllerJson.abi as Abi

import { erc20Abi as ERC20ABI, erc721Abi as ERC721ABI } from 'viem'
import TradeChart from '../../components/TradeChart'

export const dynamic = 'force-dynamic'

// --- small helper for the phase label ---
function phaseLabel(p?: number) {
  switch (p) {
    case 0: return 'Paused'
    case 1: return 'PaMs Only'
    case 2: return 'Whitelist + PaMs'
    case 3: return 'Public'
    default: return typeof p === 'number' ? `Phase ${p}` : 'Unknown'
  }
}

function EmbedInner() {
  const qs = useSearchParams()
  const admin = qs.get('admin') === '1'

  const defaultCurve = process.env.NEXT_PUBLIC_DEFAULT_CURVE as `0x${string}` | undefined
  const curve = (qs.get('curve') as `0x${string}` | null) || defaultCurve || null

const envToken = (process.env.NEXT_PUBLIC_TOKEN || '') as `0x${string}`
const token = (envToken && envToken.toLowerCase() !== '0x000000000000000000000000000000000000800a'
  ? envToken
  : (curve || '' as any)) as `0x${string}`

  const defaultChain = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN || '11124')
  const chain = Number(qs.get('chain') || defaultChain)

  const pams = (process.env.NEXT_PUBLIC_PAMS_NFT || '') as `0x${string}`
  const acl  = (process.env.NEXT_PUBLIC_ACCESS_CONTROLLER || '') as `0x${string}`
  const absRpc = process.env.NEXT_PUBLIC_ABSTRACT_RPC || 'https://api.testnet.abs.xyz'
  const mainnetRpc = process.env.NEXT_PUBLIC_MAINNET_RPC

  const { connect, connectors } = useConnect()
  const { address, isConnected } = useAccount()
  const injectedConnector = connectors.find((c: any) => c.type === 'injected') ?? connectors[0]

  const [ethIn, setEthIn] = useState('0.01')
  const [tokIn, setTokIn] = useState('10')
  const [busy, setBusy] = useState(false)

  // Badges/state
  const [pamsCount, setPamsCount] = useState<bigint | null>(null)
  const [phase, setPhase] = useState<number | undefined>(undefined)
  const [allowlisted, setAllowlisted] = useState<boolean | null>(null)
  const [badgeErr, setBadgeErr] = useState<string | null>(null)

  const pub = useMemo(
    () => createPublicClient({ chain: abstractSepolia, transport: http(absRpc) }),
    [absRpc]
  )
  const mainnet = useMemo(
    () => (mainnetRpc ? createPublicClient({
      chain: { id: 1, name:'mainnet', nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18}, rpcUrls:{default:{http:[mainnetRpc]}} } as any,
      transport: http(mainnetRpc)
    }) : null),
    [mainnetRpc]
  )
  const wallet = useMemo(
    () =>
      isConnected && typeof window !== 'undefined' && (window as any).ethereum
        ? createWalletClient({
            chain: abstractSepolia,
            transport: custom((window as any).ethereum),   // browser wallet provider
          })
        : null,
    [isConnected]
  )

  useEffect(() => { document.body.style.background = 'transparent' }, [])

  // PHASE: fetch regardless of connection so the UI isn't "Unknown"
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!acl) { setPhase(undefined); return }
        // Try getPhase(), then phase()
        let p: unknown
        try {
          p = await pub.readContract({ address: acl, abi: ACLABI, functionName: 'getPhase' })
        } catch {
          p = await pub.readContract({ address: acl, abi: ACLABI, functionName: 'phase' })
        }
        // viem may return bigint; normalize to number
        const n = typeof p === 'bigint' ? Number(p) : (typeof p === 'number' ? p : undefined)
        if (!cancelled) setPhase(n)
      } catch (e: any) {
        console.error('Phase read failed:', e)
        if (!cancelled) setPhase(undefined)
      }
    })()
    return () => { cancelled = true }
  }, [acl, pub])

  // ALLOWLIST + PaMs: only when connected (needs address)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setAllowlisted(null)
      setPamsCount(null)
      setBadgeErr(null)
      if (!address) return
      try {
        if (acl) {
          try {
            const ok = await pub.readContract({ address: acl, abi: ACLABI, functionName: 'isAllowlisted', args: [address] }) as boolean
            if (!cancelled) setAllowlisted(ok)
          } catch (e:any) {
            console.error('Allowlist read failed:', e?.message || e)
          }
        }
        if (pams && mainnet) {
          try {
            const bal = await mainnet.readContract({ address: pams, abi: ERC721ABI, functionName: 'balanceOf', args: [address] }) as bigint
            if (!cancelled) setPamsCount(bal)
          } catch (e:any) {
            console.error('PaMs read failed:', e?.message || e)
            if (!cancelled) setBadgeErr('PaMs read failed')
          }
        }
      } catch (e:any) {
        console.error('Badge fetch failed:', e?.message || e)
        if (!cancelled) setBadgeErr(e?.message || 'Badge fetch failed')
      }
    })()
    return () => { cancelled = true }
  }, [address, acl, pams, pub, mainnet])

  // --- Eligibility gating (Buy) ---
  const hasPams = (pamsCount ?? 0n) > 0n
  const canBuy =
    (phase === 3) ||                              // Public
    (phase === 2 && (allowlisted === true || hasPams)) ||     // WL + PaMs (checking WL here)
    (phase === 1 && hasPams)                      // PaMs-only

  let disabledReason = ''
  if (!isConnected) disabledReason = 'Connect wallet to continue'
  else if (phase === undefined) disabledReason = 'Checking eligibility…'
  else if (phase === 0) disabledReason = 'Paused'
  else if (phase === 1 && !hasPams) disabledReason = 'PaMs holders only'
  else if (phase === 2 && !(allowlisted === true || hasPams))
  disabledReason = 'Not whitelisted (or you need a PaMs)'

  const doBuy = async () => {
  if (!isConnected) { connect({ connector: injectedConnector }); return }
  if (!curve) return alert('Missing curve address')

  // Preflight guard (double-check)
  if (!canBuy) {
    alert(disabledReason || 'Not eligible to buy right now')
    return
  }

  setBusy(true)
  try {
    const value = parseEther(ethIn || '0.01')

    // 1) Send tx and capture the hash
    const hash = await wallet!.writeContract({
      account: address as `0x${string}`,
      chain: abstractSepolia,
      address: curve as `0x${string}`,
      abi: TokenABI,
      functionName: 'buyExactEth',
      args: [0n],
      value,
    })

    // 2) Wait for confirmation using your public client
    const receipt = await pub.waitForTransactionReceipt({ hash })

    // 3) Optional: simple success check & message
    if (receipt.status === 'success') {
      alert(`Buy confirmed: ${hash}`)
    } else {
      alert(`Transaction mined but not successful: ${hash}`)
    }
  } catch (e: any) {
    alert(e?.shortMessage || e?.message || 'Buy failed')
  } finally {
    setBusy(false)
  }
}

function pickSellCall(abi: Abi, {
  amountIn,
  minEthOut = 0n,
  recipient,
}: { amountIn: bigint; minEthOut?: bigint; recipient?: `0x${string}` }) {
  const fns = (abi as any[]).filter(
    (e) => e?.type === 'function' && typeof e?.name === 'string' && e.name.toLowerCase().includes('sell')
  )

  for (const f of fns) {
    const ins = f?.inputs || []
    const types = ins.map((i: any) => (i?.type || '').toLowerCase())
    if (types.length === 2 && types[0].startsWith('uint') && types[1].startsWith('uint')) {
      return { functionName: f.name as any, args: [amountIn, minEthOut] as const }
    }
  }
  for (const f of fns) {
    const ins = f?.inputs || []
    const types = ins.map((i: any) => (i?.type || '').toLowerCase())
    if (types.length === 3 && types.filter((t: string) => t.startsWith('uint')).length >= 2 && types.includes('address')) {
      return { functionName: f.name as any, args: [amountIn, minEthOut, recipient] as const }
    }
  }
  for (const f of fns) {
    const ins = f?.inputs || []
    const types = ins.map((i: any) => (i?.type || '').toLowerCase())
    if (types.length === 1 && types[0].startsWith('uint')) {
      return { functionName: f.name as any, args: [amountIn] as const }
    }
  }
  throw new Error('No compatible sell function found in BondingCurveToken ABI')
}

const doSell = async () => {
  try {
    if (!isConnected) { await connect({ connector: injectedConnector }); return }
    if (!curve) { console.log('Missing curve'); return }
    if (!token) { console.log('Missing token'); return }
    if (phase === 0) { console.log('Selling is paused'); return }

    setBusy(true)
    const amountIn = parseEther(tokIn || '10')

    // 1) allowance on token (resolved above)
    const allowance = await pub.readContract({
      address: token,
      abi: ERC20ABI,
      functionName: 'allowance',
      args: [address as `0x${string}`, curve as `0x${string}`],
    }) as bigint

    // 2) approve if needed
    if (allowance < amountIn) {
      const approveHash = await wallet!.writeContract({
        account: address as `0x${string}`,
        chain: abstractSepolia,
        address: token,
        abi: ERC20ABI,
        functionName: 'approve',
        args: [curve as `0x${string}`, amountIn],
      })
      await pub.waitForTransactionReceipt({ hash: approveHash })
    }

    // 3) simulate & send sell on curve
    const { functionName, args } = pickSellCall(TokenABI, {
      amountIn,
      minEthOut: 0n,
      recipient: address as `0x${string}`,
    })
    const sim = await pub.simulateContract({
      address: curve as `0x${string}`,
      abi: TokenABI,
      functionName,
      args: args as any,
      account: address as `0x${string}`,
      chain: abstractSepolia,
    })
    const sellHash = await wallet!.writeContract(sim.request)
    await pub.waitForTransactionReceipt({ hash: sellHash })
  } catch (e:any) {
    console.error('[sell] error', e)
  } finally {
    setBusy(false)
  }
}

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const iframeCode = `<iframe
  src="${origin}/embed?curve=${curve || ''}&chain=${chain}"
  width="100%" height="950" style="border:0;background:transparent" loading="lazy"></iframe>`

  if (!curve) {
    return (
      <div style={{color:'#fff'}}>
        Missing curve address. Pass <code>?curve=0x...</code> or set <code>NEXT_PUBLIC_DEFAULT_CURVE</code>.
      </div>
    )
  }

  return (
    <div style={{fontFamily:'ui-sans-serif,system-ui,Arial', color:'#f2f2f2'}}>
      {admin && (
        <div className="card" style={{background:'#0e0e10', marginBottom:12}}>
          <b>Admin Embed</b>
          <div style={{marginTop:8}}>
            <button onClick={async()=>{ await navigator.clipboard.writeText(iframeCode); alert('Embed code copied!')}}>Copy iframe</button>
          </div>
          <pre style={{whiteSpace:'pre-wrap', marginTop:8, fontSize:12, opacity:.85}}>{iframeCode}</pre>
        </div>
      )}

      {/* Top status row: show phase even if not connected */}
      <div className="card" style={{marginBottom:12}}>
        <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', fontSize:12}}>
          <span className="badge">{`Phase: ${phaseLabel(phase)}`}</span>

          {isConnected && (
            <>
              <span style={{opacity:.8}}>Connected: {address?.slice(0,6)}…{address?.slice(-4)}</span>
              {allowlisted !== null && (
                <span className="badge" style={{background: allowlisted ? '#113a1a' : '#3a1111', borderColor: allowlisted ? '#1f8a36' : '#8a1f1f'}}>
                  {allowlisted ? '✅ WHITELISTED' : '❌ NOT WHITELISTED'}
                </span>
              )}
              {pamsCount !== null && (
                <span className="badge">{`PaMs: ${pamsCount.toString()}`}</span>
              )}
              {badgeErr && <span className="badge" style={{background:'#3a1111', borderColor:'#8a1f1f'}}>⚠ {badgeErr}</span>}
            </>
          )}
        </div>
      </div>

      <div className="card">
        {!isConnected ? (
          <button onClick={() => connect({ connector: injectedConnector })}>Connect Wallet</button>
        ) : null}

        <div style={{display:'flex', gap:12, marginTop:12}}>
          <div style={{flex:1}}>
            <label>Buy with ETH</label>
            <input value={ethIn} onChange={e=>setEthIn(e.target.value)} />
            <button
              onClick={async () => { if (!canBuy) return; await doBuy() }}
              disabled={busy || !canBuy}
              style={{marginTop:8}}
              title={!canBuy && disabledReason ? disabledReason : undefined}
            >
              {busy ? 'Processing…' : 'Buy'}
            </button>
            {!canBuy && disabledReason && (
              <div style={{marginTop:6, fontSize:12, color:'#ff9f9f'}}>
                {disabledReason}
              </div>
            )}
          </div>

          <div style={{flex:1}}>
            <label>Sell tokens</label>
            <input value={tokIn} onChange={e=>setTokIn(e.target.value)} />
            <button onClick={doSell} disabled={busy || phase === 0} style={{marginTop:8}}>
              {busy ? 'Processing…' : 'Sell'}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <b>Live Trades</b>
        <TradeChart address={curve!} />
      </div>

      <style>{`
        .card{border:1px solid #222;padding:16px;border-radius:16px;background:#0e0e10;margin-bottom:12px}
        button{padding:8px 12px;border:1px solid #333;background:#111;color:#fff;border-radius:8px;cursor:pointer}
        input,label{display:block}
        input{width:100%;background:#0f0f11;color:#fff;border:1px solid #333;border-radius:8px;padding:8px;margin-top:4px}
        .badge{display:inline-block;padding:4px 8px;border:1px solid #2a2a2a;border-radius:9999px;background:#151515}
      `}</style>
    </div>
  )
}

// Wrap in Suspense to satisfy Next’s CSR bailout for useSearchParams
export default function Embed() {
  return (
    <Suspense fallback={<div style={{color:'#fff'}}>Loading…</div>}>
      <EmbedInner />
    </Suspense>
  )
}
