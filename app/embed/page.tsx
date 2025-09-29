'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAccount, useConnect } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { parseEther, createPublicClient, createWalletClient, http, custom } from 'viem' // ✅ add custom
import { abstractSepolia } from '@/lib/wagmi';
import type { Abi } from 'viem';
import TokenJson from '@/lib/abi/BondingCurveToken.json'; // default JSON artifact
const TokenABI = TokenJson.abi as Abi;                    // ✅ use the .abi array
import AccessControllerABI from '@/lib/abi/AccessController.json' // ✅ ACL
import { erc721Abi as ERC721ABI } from 'viem'
import TradeChart from '../../components/TradeChart'

export const dynamic = 'force-dynamic'

// --- small helper for the phase label ---
function phaseLabel(p?: number) {
  switch (p) {
    case 0: return 'Paused'
    case 1: return 'PaMs Only'
    case 2: return 'Public'
    default: return typeof p === 'number' ? `Phase ${p}` : 'Unknown'
  }
}

function EmbedInner() {
  const qs = useSearchParams()
  const admin = qs.get('admin') === '1'

  const defaultCurve = process.env.NEXT_PUBLIC_DEFAULT_CURVE as `0x${string}` | undefined
  const curve = (qs.get('curve') as `0x${string}` | null) || defaultCurve || null

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

  // NEW: badges state
  const [pamsCount, setPamsCount] = useState<bigint | null>(null)
  const [phase, setPhase] = useState<number | undefined>(undefined)
  const [allowlisted, setAllowlisted] = useState<boolean | null>(null)
  const [badgeErr, setBadgeErr] = useState<string | null>(null)

  const pub = useMemo(
    () => createPublicClient({ chain: abstractSepolia, transport: http(absRpc) }),
    [absRpc]
  )
  const mainnet = useMemo(
    () => (mainnetRpc ? createPublicClient({ chain: { id: 1, name:'mainnet', nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18}, rpcUrls:{default:{http:[mainnetRpc]}} } as any, transport: http(mainnetRpc) }) : null),
    [mainnetRpc]
  )
  const wallet = useMemo(
  () =>
    isConnected && typeof window !== 'undefined' && (window as any).ethereum
      ? createWalletClient({
          chain: abstractSepolia,
          transport: custom((window as any).ethereum),   // ✅ use custom(provider), not http(...)
        })
      : null,
  [isConnected]
)

  useEffect(() => { document.body.style.background = 'transparent' }, [])

  // NEW: fetch badges on connect or when address changes
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setBadgeErr(null)
      setPamsCount(null)
      setPhase(undefined)
      setAllowlisted(null)
      if (!address) return
      try {
        // Phase (ACL)
        if (acl) {
          try {
            // try getPhase(), else phase()
            let p = await pub.readContract({ address: acl, abi: AccessControllerABI as any, functionName: 'getPhase', args: [] }) as any
            if (typeof p !== 'number') {
              p = await pub.readContract({ address: acl, abi: AccessControllerABI as any, functionName: 'phase', args: [] }) as any
            }
            if (!cancelled) setPhase(Number(p))
          } catch { /* ignore */ }
        }
        // Allowlist
        if (acl && address) {
          try {
            const ok = await pub.readContract({ address: acl, abi: AccessControllerABI as any, functionName: 'isAllowlisted', args: [address] }) as boolean
            if (!cancelled) setAllowlisted(ok)
          } catch { /* ignore */ }
        }
        // PaMs balance (mainnet)
        if (pams && mainnet && address) {
          try {
            const bal = await mainnet.readContract({ address: pams, abi: ERC721ABI as any, functionName: 'balanceOf', args: [address] }) as bigint
            if (!cancelled) setPamsCount(bal)
          } catch (e:any) {
            if (!cancelled) setBadgeErr('PaMs read failed')
          }
        }
      } catch (e:any) {
        if (!cancelled) setBadgeErr(e?.message || 'Badge fetch failed')
      }
    })()
    return () => { cancelled = true }
  }, [address, acl, pams, pub, mainnet])

  const doBuy = async () => {
    if (!isConnected) { connect({ connector: injectedConnector }); return }
    if (!curve) return alert('Missing curve address')
    setBusy(true)
    try {
      const value = parseEther(ethIn || '0.01')
      await wallet!.writeContract({
        account: address as `0x${string}`,
        chain: abstractSepolia,
        address: curve as `0x${string}`,
        abi: TokenABI,
        functionName: 'buyExactEth',
        args: [0n],
        value,
      })
      alert('Buy sent')
    } catch (e:any) { alert(e?.shortMessage || e?.message || 'Buy failed') } finally { setBusy(false) }
  }

  const doSell = async () => {
    if (!isConnected) { connect({ connector: injectedConnector }); return }
    if (!curve) return alert('Missing curve address')
    setBusy(true)
    try {
      const amountIn = parseEther(tokIn || '10')
      await wallet!.writeContract({
        account: address as `0x${string}`,
        chain: abstractSepolia,
        address: curve as `0x${string}`,
        abi: TokenABI,
        functionName: 'sellTokens',
        args: [amountIn, 0n],
      })
      alert('Sell sent')
    } catch (e:any) { alert(e?.shortMessage || e?.message || 'Sell failed') } finally { setBusy(false) }
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const iframeCode = `<iframe
  src="${origin}/embed?curve=${curve || ''}&chain=${chain}"
  width="100%" height="950" style="border:0;background:transparent" loading="lazy"></iframe>`

  if (!curve) return <div style={{color:'#fff'}}>Missing curve address. Pass <code>?curve=0x...</code> or set <code>NEXT_PUBLIC_DEFAULT_CURVE</code>.</div>

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

      <div className="card">
        {!isConnected ? (
          <button onClick={() => connect({ connector: injectedConnector })}>Connect Wallet</button>
        ) : (
          <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', fontSize:12}}>
            <div style={{opacity:.8}}>Connected: {address?.slice(0,6)}…{address?.slice(-4)}</div>

            {/* NEW: badges */}
            {typeof phase !== 'undefined' && (
              <span className="badge">{`Phase: ${phaseLabel(phase)}`}</span>
            )}
            {allowlisted !== null && (
              <span className="badge" style={{background: allowlisted ? '#113a1a' : '#3a1111', borderColor: allowlisted ? '#1f8a36' : '#8a1f1f'}}>
                {allowlisted ? '✅ WHITELISTED' : '❌ NOT WHITELISTED'}
              </span>
            )}
            {pamsCount !== null && (
              <span className="badge">{`PaMs: ${pamsCount.toString()}`}</span>
            )}
            {badgeErr && <span className="badge" style={{background:'#3a1111', borderColor:'#8a1f1f'}}>⚠ {badgeErr}</span>}
          </div>
        )}

        <div style={{display:'flex', gap:12, marginTop:12}}>
          <div style={{flex:1}}>
            <label>Buy with ETH</label>
            <input value={ethIn} onChange={e=>setEthIn(e.target.value)} />
            <button onClick={doBuy} disabled={busy} style={{marginTop:8}}>Buy</button>
          </div>
          <div style={{flex:1}}>
            <label>Sell tokens</label>
            <input value={tokIn} onChange={e=>setTokIn(e.target.value)} />
            <button onClick={doSell} disabled={busy} style={{marginTop:8}}>Sell</button>
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
