'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPublicClient, http, formatEther } from 'viem'
import { mainnet, erc20Abi } from 'viem/chains'

import AccessControllerABI from '@/lib/abi/AccessController.json'
import PointsManagerABI    from '@/lib/abi/PointsManager.json'
import { erc721Abi as ERC721ABI } from 'viem'

// Minimal chain object for Abstract Sepolia
const abstractSepolia = {
  id: 11124,
  name: 'abstract-sepolia',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://api.testnet.abs.xyz'] } },
} as const

type Row = {
  address: `0x${string}`
  tokenBalance: bigint
  points: bigint | null
  pams: bigint | null
  allowlisted?: boolean | null
}

const PAGE_SIZE = 25

function phaseLabel(p?: number) {
  switch (p) {
    case 0: return 'Paused'
    case 1: return 'PaMs Only'
    case 2: return 'Public'
    default: return typeof p === 'number' ? `Phase ${p}` : 'Unknown'
  }
}

export default function LeaderboardClient() {
  const curve = (process.env.NEXT_PUBLIC_DEFAULT_CURVE || '') as `0x${string}`
  const pointsMgr = (process.env.NEXT_PUBLIC_POINTS_MANAGER || '') as `0x${string}`
  const pams = (process.env.NEXT_PUBLIC_PAMS_NFT || '') as `0x${string}`
  const acl = (process.env.NEXT_PUBLIC_ACCESS_CONTROLLER || '') as `0x${string}`

  const absRpc = process.env.NEXT_PUBLIC_ABSTRACT_RPC || 'https://api.testnet.abs.xyz'
  const mainnetRpc = process.env.NEXT_PUBLIC_MAINNET_RPC
  const lookback = Number(process.env.NEXT_PUBLIC_TRANSFER_LOOKBACK || '50000')
  const startBlockEnv = process.env.NEXT_PUBLIC_START_BLOCK

  const [rows, setRows] = useState<Row[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<number | undefined>(undefined)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    try {
      const qp = new URLSearchParams(window.location.search)
      setIsAdmin(qp.get('admin') === '1')
    } catch {}
  }, [])

  const absClient = useMemo(() => createPublicClient({ chain: abstractSepolia as any, transport: http(absRpc) }), [absRpc])
  const ethClient = useMemo(() => mainnetRpc ? createPublicClient({ chain: mainnet, transport: http(mainnetRpc) }) : null, [mainnetRpc])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!curve) { setError('Missing NEXT_PUBLIC_DEFAULT_CURVE'); return }
      setLoading(true); setError(null)
      try {
        // --- Phase ---
        if (acl) {
          try {
            let p = await absClient.readContract({
              address: acl,
              abi: AccessControllerABI as any,
              functionName: 'getPhase',
              args: [],
            }) as any
            if (typeof p !== 'number') {
              p = await absClient.readContract({
                address: acl,
                abi: AccessControllerABI as any,
                functionName: 'phase',
                args: [],
              }) as any
            }
            if (!cancelled) setPhase(Number(p))
          } catch {}
        }

        const latest = await absClient.getBlockNumber()
        const fromBlock = startBlockEnv ? BigInt(startBlockEnv) : (latest - BigInt(lookback))

        // --- Fetch Transfer logs to identify addresses ---
        const logs = await absClient.getLogs({
          address: curve,
          event: {
            type: 'event',
            name: 'Transfer',
            inputs: [
              { indexed: true, name: 'from', type: 'address' },
              { indexed: true, name: 'to', type: 'address' },
              { indexed: false, name: 'value', type: 'uint256' },
            ],
          } as any,
          fromBlock,
          toBlock: latest,
        })

        // Unique address list
        const addrSet = new Set<`0x${string}`>()
        for (const lg of logs) {
          const from = (lg as any).args?.from as `0x${string}`
          const to = (lg as any).args?.to as `0x${string}`
          if (from && from !== '0x0000000000000000000000000000000000000000') addrSet.add(from)
          if (to && to !== '0x0000000000000000000000000000000000000000') addrSet.add(to)
        }

        // --- Fetch live balances ---
        const candidates: Row[] = []
        for (const who of addrSet) {
          try {
            const bal = await absClient.readContract({
              address: curve,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [who],
            }) as bigint
            if (bal > 0n)
              candidates.push({ address: who, tokenBalance: bal, points: null, pams: null, allowlisted: null })
          } catch {}
        }

        // --- Points (Abstract) ---
        if (pointsMgr) {
          for (let i = 0; i < candidates.length; i++) {
            try {
              const who = candidates[i].address
              let pts: bigint | null = null
              try {
                pts = await absClient.readContract({
                  address: pointsMgr,
                  abi: PointsManagerABI as any,
                  functionName: 'pointsOf',
                  args: [who],
                }) as bigint
              } catch {
                pts = await absClient.readContract({
                  address: pointsMgr,
                  abi: PointsManagerABI as any,
                  functionName: 'points',
                  args: [who],
                }) as bigint
              }
              candidates[i].points = pts
            } catch {}
          }
        }

        // --- PaMs (Mainnet) ---
        if (pams && ethClient) {
          for (let i = 0; i < candidates.length; i++) {
            try {
              const who = candidates[i].address
              const bal = await ethClient.readContract({
                address: pams,
                abi: ERC721ABI as any,
                functionName: 'balanceOf',
                args: [who],
              }) as bigint
              candidates[i].pams = bal
            } catch {}
          }
        }

        // --- Allowlist (Abstract) ---
        if (acl) {
          for (let i = 0; i < candidates.length; i++) {
            try {
              const who = candidates[i].address
              const ok = await absClient.readContract({
                address: acl,
                abi: AccessControllerABI as any,
                functionName: 'isAllowlisted',
                args: [who],
              }) as boolean
              candidates[i].allowlisted = ok
            } catch {}
          }
        }

        // --- Sort ---
        candidates.sort((a, b) => {
          const ap = a.points ?? 0n, bp = b.points ?? 0n
          if (ap !== bp) return Number(bp - ap)
          return Number(b.tokenBalance - a.tokenBalance)
        })

        if (!cancelled) setRows(candidates.slice(0, 100))
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load leaderboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [curve, pointsMgr, pams, acl, absClient, ethClient, lookback, startBlockEnv])

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const iframeCode = `<iframe src="${origin}/embed-leaderboard" width="100%" height="720" style="border:0;background:transparent" loading="lazy"></iframe>`

  return (
    <div style={{ fontFamily: 'ui-sans-serif,system-ui,Arial', color: '#f2f2f2' }}>
      <div className="card" style={{ background: '#0e0e10', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b>Leaderboard</b>
          <div style={{ fontSize: 12, opacity: .8 }}>
            Phase: <b>{phaseLabel(phase)}</b>
          </div>
        </div>

        {isAdmin && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, opacity: .9, marginBottom: 6 }}><b>Admin Leaderboard Embed</b></div>
            <button onClick={async () => { await navigator.clipboard.writeText(iframeCode); alert('Embed code copied!') }}>
              Copy iframe
            </button>
            <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8, fontSize: 12, opacity: .85 }}>{iframeCode}</pre>
          </div>
        )}
      </div>

      {loading && <div>Loading…</div>}
      {error && <div style={{ color: '#f66' }}>{error}</div>}

      {!loading && !error && (
        <div className="card">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', fontSize: 12, opacity: .8 }}>
                <th style={{ padding: '8px' }}>#</th>
                <th style={{ padding: '8px' }}>Address</th>
                <th style={{ padding: '8px' }}>Allowlist</th>
                <th style={{ padding: '8px' }}>Points</th>
                <th style={{ padding: '8px' }}>PaMs</th>
                <th style={{ padding: '8px' }}>Token Bal</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => (
                <tr key={r.address} style={{ borderTop: '1px solid #222' }}>
                  <td style={{ padding: '8px' }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                  <td style={{ padding: '8px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                    {r.address.slice(0, 6)}…{r.address.slice(-4)}
                  </td>
                  <td style={{ padding: '8px' }}>
                    {r.allowlisted == null ? '—' : (r.allowlisted ? '✅ WHITELISTED' : '❌ NOT WHITELISTED')}
                  </td>
                  <td style={{ padding: '8px' }}>{r.points !== null ? r.points.toString() : '—'}</td>
                  <td style={{ padding: '8px' }}>{r.pams !== null ? r.pams.toString() : '—'}</td>
                  <td style={{ padding: '8px' }}>{formatEther(r.tokenBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Prev</button>
            <div style={{ fontSize: 12, opacity: .85 }}>Page {page} / {totalPages}</div>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</button>
          </div>
        </div>
      )}

      <style>{`
        .card{border:1px solid #222;padding:16px;border-radius:16px;background:#0e0e10;margin-bottom:12px}
        button{padding:8px 12px;border:1px solid #333;background:#111;color:#fff;border-radius:8px;cursor:pointer}
        table th, table td { border-color:#222 }
      `}</style>
    </div>
  )
}
