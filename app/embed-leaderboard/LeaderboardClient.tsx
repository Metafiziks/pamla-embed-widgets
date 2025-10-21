'use client'

import { useEffect, useMemo, useState } from 'react'

type ApiRow = {
  address: `0x${string}`
  buyVolumeEth?: number
  sellVolumeEth?: number
  totalVolumeEth?: number
}

type ApiPayload = {
  generatedAt?: string
  rows: ApiRow[]
}

const PAGE_SIZE = 25

export default function LeaderboardClient() {
  // Point this at your route if you mounted the API somewhere else.
  // e.g. NEXT_PUBLIC_LEADERBOARD_API="https://your-app.onrender.com/api/leaderboard-volume"
  const endpoint =
    (process.env.NEXT_PUBLIC_LEADERBOARD_API || '/api/leaderboard-volume') as string

  const [rows, setRows] = useState<ApiRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageRows = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(endpoint, { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as ApiPayload

        // Normalize + sort by totalVolumeEth desc
        const normalized = (data.rows || []).map(r => ({
          address: r.address,
          buyVolumeEth: r.buyVolumeEth ?? 0,
          sellVolumeEth: r.sellVolumeEth ?? 0,
          totalVolumeEth:
            r.totalVolumeEth ??
            (r.buyVolumeEth ?? 0) + (r.sellVolumeEth ?? 0),
        }))

        normalized.sort(
          (a, b) => (b.totalVolumeEth || 0) - (a.totalVolumeEth || 0)
        )

        if (!cancelled) {
          setRows(normalized)
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
  }, [endpoint])

  const origin =
    typeof window !== 'undefined' ? window.location.origin : ''
  const iframeCode = `<iframe src="${origin}/embed-leaderboard" width="100%" height="720" style="border:0;background:transparent" loading="lazy"></iframe>`

  return (
    <div style={{ fontFamily: 'ui-sans-serif,system-ui,Arial', color: '#f2f2f2' }}>
      <div className="card" style={{ background: '#0e0e10', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b>Leaderboard</b>
          <small style={{ opacity: .8 }}>
            Data source: <code style={{ opacity: .8 }}>{endpoint}</code>
          </small>
        </div>

        {/* Optional: quick embed helper (toggle with ?admin=1) */}
        {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('admin') === '1' && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, opacity: .9, marginBottom: 6 }}><b>Admin Leaderboard Embed</b></div>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(iframeCode)
                alert('Embed code copied!')
              }}
            >
              Copy iframe
            </button>
            <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8, fontSize: 12, opacity: .85 }}>
              {iframeCode}
            </pre>
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
                <th style={{ padding: '8px' }}>Volume (ETH)</th>
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
                    {formatVolume(r.totalVolumeEth)}
                  </td>
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

function formatVolume(v?: number) {
  if (!v || !isFinite(v)) return '0'
  // 4 d.p. feels right for small totals; tweak if you want fewer decimals
  return Number(v).toFixed(4)
}
