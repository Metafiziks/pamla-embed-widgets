import type { Abi } from 'viem';

import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useAccount, useConnect, useWalletClient } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { parseEther, parseGwei } from 'viem'
import { publicClient } from '@/lib/viem'
import TokenJson from '@/lib/abi/BondingCurveToken.json';
const TokenABI = TokenJson.abi as Abi; // ✅ use the abi array, typed as Abi

import { abstractSepolia } from '../../lib/wagmi'
import TradeChart from '../../components/TradeChart'


export default function EmbedClient() {
  const qs = useSearchParams()
  const admin = qs.get('admin') === '1'

  // 🔒 Centralized token precedence: NEXT_PUBLIC_TOKEN > ?curve= > NEXT_PUBLIC_DEFAULT_CURVE
  const token = useMemo(() => {
    const bad = '0x000000000000000000000000000000000000800a'
    const envT = (process.env.NEXT_PUBLIC_TOKEN || '') as `0x${string}` | ''
    const qsCurve = (qs.get('curve') as `0x${string}` | null) || null
    const envCurve = process.env.NEXT_PUBLIC_DEFAULT_CURVE as `0x${string}` | undefined
    if (envT && envT.toLowerCase() !== bad) return envT
    if (qsCurve && qsCurve.toLowerCase() !== bad) return qsCurve
    return (envCurve && envCurve.toLowerCase() !== bad ? envCurve : '') as `0x${string}`
  }, [qs])

  // keep the rest of the file using `curve` so no other code needs to change
  const curve = token || null

  const defaultChain = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN || '11124')
  const chain = Number(qs.get('chain') || defaultChain)

  const { connect, connectors } = useConnect()
  const { address, isConnected, chain: activeChain } = useAccount()
  const { data: wallet } = useWalletClient()

  const injectedConnector =
    connectors.find((c: any) => c.type === 'injected') ?? connectors[0]

  const [ethIn, setEthIn] = useState('0.01')
  const [tokIn, setTokIn] = useState('10')
  const [busy, setBusy] = useState(false)

  useEffect(() => { document.body.style.background = 'transparent' }, [])

  const guardChain = () => {
    if (!activeChain || activeChain.id !== abstractSepolia.id) {
      alert('Wrong chain. Please switch to Abstract Sepolia.')
      return false
    }
    return true
  }

  const doBuy = async () => {
  if (!isConnected) { connect({ connector: injectedConnector }); return }
  if (!curve) return alert('Missing curve address')
  if (!guardChain()) return
  if (!wallet) return alert('Wallet not ready')

  setBusy(true)
  try {
    const value = parseEther(ethIn || '0.01')

    const sim = await publicClient.simulateContract({
      account: address as `0x${string}`,
      chain: abstractSepolia,
      address: curve as `0x${string}`,
      abi: TokenABI,
      functionName: 'buyExactEth',
      args: [0n], // adjust if you later add slippage controls
      value,
    })

    const hash = await wallet.writeContract(sim.request)
    alert(`Buy sent: ${hash}`)
  } catch (e: any) {
    alert(e?.shortMessage || e?.message || 'Buy failed')
  } finally {
    setBusy(false)
  }
}

  const doSell = async () => {
  if (!isConnected) { connect({ connector: injectedConnector }); return }
  if (!curve) return alert('Missing curve address')
  if (!guardChain()) return
  if (!wallet) return alert('Wallet not ready')

  setBusy(true)
  try {
    const amountIn = parseEther(tokIn || '0')
    if (amountIn <= 0n) { alert('Enter a token amount'); return }

    // 1) simulate (locks calldata, gas, etc.)
    const sim = await publicClient.simulateContract({
      account: address as `0x${string}`,
      chain: abstractSepolia,
      address: curve as `0x${string}`,
      abi: TokenABI,
      functionName: 'sellTokens',
      args: [amountIn, 1n], // minEthOut = 1 wei (avoid zero-min edge cases)
    })

    // 2) send EXACTLY what we simulated — no extra fields
    const hash = await wallet.writeContract(sim.request)
    alert(`Sell sent: ${hash}`)
  } catch (e: any) {
    alert(e?.shortMessage || e?.message || 'Sell failed')
  } finally {
    setBusy(false)
  }
}

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const iframeCode = `<iframe
  src="${origin}/embed?curve=${curve || ''}&chain=${chain}"
  width="100%" height="950" style="border:0;background:transparent" loading="lazy"></iframe>`

  if (!curve) return (
    <div style={{color:'#fff'}}>
      Missing curve address. Pass <code>?curve=0x...</code> or set <code>NEXT_PUBLIC_DEFAULT_CURVE</code>.
    </div>
  )

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
          <div style={{fontSize:12, opacity:.8}}>Connected: {address?.slice(0,6)}…{address?.slice(-4)}</div>
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
        <TradeChart address={curve} />
      </div>
      <style>{`
        .card{border:1px solid #222;padding:16px;border-radius:16px;background:#0e0e10;margin-bottom:12px}
        button{padding:8px 12px;border:1px solid #333;background:#111;color:#fff;border-radius:8px;cursor:pointer}
        input,label{display:block}
        input{width:100%;background:#0f0f11;color:#fff;border:1px solid #333;border-radius:8px;padding:8px;margin-top:4px}
      `}</style>
    </div>
  )
}
