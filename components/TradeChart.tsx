'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { parseEventLogs, type Log } from 'viem'
import { ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar } from 'recharts'

import TokenAbiJson from '@/lib/abi/BondingCurveToken.json'
import { publicClient } from '@/lib/viem'

// Normalize ABI whether the JSON has { abi: [...] } or is already the array
const TOKEN_ABI = (TokenAbiJson as any).abi ?? (TokenAbiJson as any)

// ---- Controls ----
// We keep one control: the time RANGE (includes "All")
const RANGES = [
  { key: '1m', ms: 60 * 1000, label: '1m' },
  { key: '5m', ms: 5 * 60 * 1000, label: '5m' },
  { key: '1h', ms: 60 * 60 * 1000, label: '1h' },
  { key: '24h', ms: 24 * 60 * 60 * 1000, label: '24h' },
  { key: 'all', ms: Infinity, label: 'All' },
] as const

type RangeKey = (typeof RANGES)[number]['key']

// Fixed candle interval (5m) so we don’t show duplicate controls
const FIXED_INTERVAL_MS = 5 * 60 * 1000

// Poll period
const POLL_MS = 30_000

interface TradeLike {
  ts: number
  price?: number | null // optional (can be missing in fallback)
  amount: number
}

interface Candle {
  ts: number
  price: number | null
  volume: number
}

export default function TradeChart({
  address,
  symbol = '$PAMLA',
  defaultRange = 'all',
}: {
  address: `0x${string}`
  symbol?: string
  defaultRange?: RangeKey
}) {
  const [range, setRange] = useState<RangeKey>(defaultRange)
  const rangeMs = RANGES.find(r => r.key === range)!.ms

  const [trades, setTrades] = useState<TradeLike[]>([])
  const [err, setErr] = useState<string | null>(null)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function limitToWindow(list: TradeLike[], windowMs: number) {
    if (windowMs === Infinity) return list
    const cutoff = Date.now() - windowMs
    let i = list.findIndex(t => t.ts >= cutoff)
    if (i === -1) i = Math.max(0, list.length - 5000)
    return list.slice(i)
  }

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setErr(null)

      try {
        const latest = await publicClient.getBlockNumber()
        // widen span for "all" so we have history; adjust to your chain’s block cadence
        const span = range === 'all' ? 250_000n : 80_000n
        const fromBlock = latest > span ? latest - span : 0n

        // 1) Try to parse on-chain Trade-like events if ABI has them
        const logs = await publicClient.getLogs({ address, fromBlock, toBlock: latest })
        const parsed = parseEventLogs({ abi: TOKEN_ABI, logs, strict: false })

        let txs: TradeLike[] = (parsed as Log[])
          // keep any event that carries both price & amount
          .filter((l: any) => l.args && (l.args.price !== undefined || l.args.amount !== undefined))
          .map((l: any) => ({
            ts: Number(l.args?.timestamp ?? (l.blockTimestamp ?? Date.now())),
            // Some ABIs may name these differently; try common names:
            price:
              l.args?.price !== undefined
                ? Number(l.args.price)
                : l.args?.ethPerToken !== undefined
                ? Number(l.args.ethPerToken)
                : null,
            amount:
              l.args?.amount !== undefined
                ? Number(l.args.amount)
                : l.args?.tokens !== undefined
                ? Number(l.args.tokens)
                : 0,
          }))
          .filter(t => t.amount > 0)
          .sort((a, b) => a.ts - b.ts)

        // 2) Fallback: if we didn’t find any, derive basic volume bars from ERC20 Transfer logs
        if (txs.length === 0) {
          const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          const xferLogs = await publicClient.getLogs({
            address,
            topics: [transferTopic],
            fromBlock,
            toBlock: latest,
          })

          // cap to the most recent N to avoid excessive block lookups
          const recent = xferLogs.slice(-250)

          // Map to { ts, amount }, fetch timestamps per block
          const withTs = await Promise.all(
            recent.map(async (l) => {
              let ts = Date.now()
              try {
                if (l.blockHash) {
                  const blk = await publicClient.getBlock({ blockHash: l.blockHash })
                  ts = Number(blk.timestamp) * 1000
                }
              } catch {
                // ignore timestamp errors
              }
              // l.data is the value (uint256) for Transfer
              const amount = Number(BigInt(l.data as `0x${string}`)) / 1e18
              return { ts, amount }
            })
          )

          txs = withTs
            .filter(t => t.amount > 0)
            .map(t => ({ ...t, price: null })) // no price info in fallback
            .sort((a, b) => a.ts - b.ts)
        }

        const windowed = range === 'all' ? txs : limitToWindow(txs, rangeMs)
        setTrades(windowed)
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Failed to load trades')
      }

      if (!cancelled) {
        timerRef.current = setTimeout(run, POLL_MS)
      }
    }

    run()
    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [address, range, rangeMs])

  // Candle aggregation on fixed 5m interval
  const candles: Candle[] = useMemo(() => {
    if (trades.length === 0) return []
    const grouped: Record<number, Candle> = {}
    for (const t of trades) {
      const bucket = Math.floor(t.ts / FIXED_INTERVAL_MS) * FIXED_INTERVAL_MS
      if (!grouped[bucket]) {
        grouped[bucket] = { ts: bucket, price: null, volume: 0 }
      }
      // Use last seen price in bucket if we have one; price may be null in fallback
      if (typeof t.price === 'number') grouped[bucket].price = t.price
      grouped[bucket].volume += t.amount
    }
    return Object.values(grouped).sort((a, b) => a.ts - b.ts)
  }, [trades])

  const data = useMemo(
    () =>
      candles.map(c => ({
        time: new Date(c.ts).toLocaleTimeString(),
        price: c.price,
        volume: c.volume,
      })),
    [candles]
  )

  const hasPrice = data.some(d => typeof d.price === 'number' && !Number.isNaN(d.price))

  return (
    <div className="trade-chart-wrap" style={{ paddingTop: 12 }}>
      {/* Range controls (single row, includes All) */}
      <div
        className="chart-controls"
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}
      >
        {RANGES.map(r => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            style={{
              background: range === r.key ? '#333' : '#1a1a1a',
              color: '#fff',
              borderRadius: 4,
              padding: '4px 8px',
              border: '1px solid #444',
              cursor: 'pointer',
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div
        style={{
          width: '100%',
          height: 300,
          marginTop: 44,
          paddingTop: 8,
          overflow: 'hidden',
          zIndex: 1,
        }}
      >
        {data.length === 0 ? (
          <div
            style={{
              opacity: 0.7,
              padding: '8px 0',
              textAlign: 'center',
            }}
          >
            No trades yet in this range.
          </div>
        ) : (
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 4 }}>
              <XAxis dataKey="time" hide />
              <YAxis hide />
              <Tooltip />
              <Bar dataKey="volume" barSize={2} fill="#333" />
              {hasPrice && (
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#00ffb3"
                  dot={false}
                  strokeWidth={2}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {err && (
        <div style={{ color: 'tomato', marginTop: 6, fontSize: 12, textAlign: 'center' }}>
          ⚠ {err}
        </div>
      )}

      {!hasPrice && data.length > 0 && (
        <div style={{ color: '#999', marginTop: 6, fontSize: 12, textAlign: 'center' }}>
          Showing volume from ERC-20 transfers. Price line will appear when on-chain Trade events are present.
        </div>
      )}
    </div>
  )
}
