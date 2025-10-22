'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatEther } from 'viem'

type ApiRow = {
  address: `0x${string}`
  buyEth: string
  sellEth: string
  totalEth: string
  buyTokens: string
  sellTokens: string
  buyCount: number
  sellCount: number
  lastBlock: string
}

type Row = {
  address: `0x${string}`
  totalEth: bigint
}

const PAGE_SIZE = 25
const DS_PATH =
  (process.env.NEXT_PUBLIC_LEADERBOARD_PATH || '/api/leaderboard') as string

export default function LeaderboardClient() {
  const [rows, setRows] = useState<Row[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string>('')

  // stable number formatter (no rounding surprises)
  const fmt = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        maximumFractionDigits: 6,
      }),
    []
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(DS_PATH, { cache: 'no-store' })
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        // 304 handling: treat as no change
        if (res.status === 304) {
          if (!cancelled) setLoading(false)
          return
        }
        const data = (await res.json()) as unknown

        // Defensive parsing
        const arr = Array.isArray(data) ? (data as ApiRow[]) : []
        const mapped: Row[] = arr
          .map((r) => {
            try {
              // BigInt from string; fall back to 0n
              const total = r?.totalEth ? BigInt(r.totalEth) : 0n
              const addr = (r?.address || '').toLowerCase() as `0x${string}`
              if (!addr.startsWith('0x') || addr.length !== 42) return null
              return { address: addr, totalEth: total }
            } catch {
              return null
            }
          })
          .filter((x): x is Row => !!x)
          .sort((a, b) => (a.totalEth === b.totalEth ? 0 : b.totalEth > a.totalEth ? 1 : -1))

        if (!cancelled) {
          setRows(mapped)
          setFetchedAt(new Date().toLocaleTimeString())
          setPage(1)
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load leaderboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div style={{ fontFamily: 'ui-sans-serif,system-ui,Arial', color: '#f2f2f2' }}>
      <div className="card" style={{ background: '#0e0e10', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b>Leaderboard</b>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Data source: <code style={{ opacity: 0.9 }}>{DS_PATH}</code>
          </div>
        </div>
      </div>

      {loading && <div>Loading…</div>}
      {error && <div style={{ color: '#f66' }}>{error}</div>}

      {!loading && !error && (
        <div className="card">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', fontSize: 12, opacity: 0.8 }}>
                <th style={{ padding: '8px' }}>#</th>
                <th style={{ padding: '8px' }}>Address</th>
                <th style={{ padding: '8px' }}>Volume (ETH)</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ padding: '12px', opacity: 0.8 }}>
                    No data yet.
                  </td>
                </tr>
              ) : (
                pageRows.map((r, i) => (
                  <tr key={r.address} style={{ borderTop: '1px solid #222' }}>
                    <td style={{ padding: '8px' }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td style={{ padding: '8px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                      {r.address.slice(0, 6)}…{r.address.slice(-4)}
                    </td>
                    <td style={{ padding: '8px' }}>{fmt.format(Number(formatEther(r.totalEth)))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              Prev
            </button>
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              Page {page} / {totalPages} · {rows.length} addrs · fetched {fetchedAt || '—'}
            </div>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
              Next
            </button>
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
