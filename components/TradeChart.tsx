'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Address, Log } from 'viem'
import { parseEventLogs } from 'viem'
import {
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
} from 'recharts'

import TokenAbiJson from '@/lib/abi/BondingCurveToken.json'
import { publicClient } from '@/lib/viem'

// normalize ABI whether file is { abi: [...] } or already the array
const TOKEN_ABI = (TokenAbiJson as any).abi ?? (TokenAbiJson as any)

// Minimal ERC-20 Transfer event for decoding + direction
const TRANSFER_EVENT = {
  type: 'event',
  name: 'Transfer',
  inputs: [
    { indexed: true, name: 'from', type: 'address' },
    { indexed: true, name: 'to', type: 'address' },
    { indexed: false, name: 'value', type: 'uint256' },
  ],
} as const

const RANGES = [
  { key: '1m', ms: 60 * 1000, label: '1m' },
  { key: '5m', ms: 5 * 60 * 1000, label: '5m' },
  { key: '1h', ms: 60 * 60 * 1000, label: '1h' },
  { key: '24h', ms: 24 * 60 * 60 * 1000, label: '24h' },
  { key: 'all', ms: Infinity, label: 'All' },
] as const
type RangeKey = (typeof RANGES)[number]['key']

const FIXED_INTERVAL_MS = 5 * 60 * 1000
const POLL_MS = 30_000

type Side = 'buy' | 'sell' | 'transfer'

interface TradeLike {
  ts: number
  amount: number
  price?: number | null
  side: Side
}

interface Candle {
  ts: number
  price: number | null
  buyVol: number
  sellVol: number
}

function formatTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
  const [feed, setFeed] = useState<TradeLike[]>([])
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
        const span = range === 'all' ? 250_000n : 80_000n
        const fromBlock = latest > span ? latest - span : 0n

        // 1) Try native token Trade-style events from your token ABI (if they exist)
        const logs = await publicClient.getLogs({ address, fromBlock, toBlock: latest })
        const parsed = parseEventLogs({ abi: TOKEN_ABI, logs, strict: false })

        let txs: TradeLike[] = (parsed as Log[])
          .filter(
            // accept common shapes: {price, amount} or {ethPerToken, tokens}
            (l: any) =>
              l.args &&
              (l.args.price !== undefined ||
                l.args.ethPerToken !== undefined ||
                l.args.amount !== undefined ||
                l.args.tokens !== undefined)
          )
          .map((l: any) => {
            const price =
              l.args?.price !== undefined
                ? Number(l.args.price)
                : l.args?.ethPerToken !== undefined
                ? Number(l.args.ethPerToken)
                : null
            const amount =
              l.args?.amount !== undefined
                ? Number(l.args.amount)
                : l.args?.tokens !== undefined
                ? Number(l.args.tokens)
                : 0

            // If the ABI exposes side, keep it; else mark as 'transfer' (we’ll color neutrally)
            const side: Side =
              (l.args?.side as Side | undefined) ??
              ((l.eventName === 'Buy' || l.eventName === 'TokensPurchased') && amount > 0
                ? 'buy'
                : (l.eventName === 'Sell' || l.eventName === 'TokensSold') && amount > 0
                ? 'sell'
                : 'transfer')

            const ts = Number((l as any).blockTimestamp ? (l as any).blockTimestamp * 1000 : Date.now())
            return { ts, price, amount, side }
          })
          .filter(t => t.amount > 0)
          .sort((a, b) => a.ts - b.ts)

        // 2) If no trades emitted, fall back to ERC-20 Transfer logs and infer side
        if (txs.length === 0) {
          const transferLogs = await publicClient.getLogs({
            address,
            event: TRANSFER_EVENT as any,
            fromBlock,
            toBlock: latest,
          })

          // slice to avoid hammering the chain for timestamps
          const recent = transferLogs.slice(-250)
          const tsCache = new Map<string, number>()

          const withTs = await Promise.all(
            recent.map(async (l: any) => {
              let ts = Date.now()
              try {
                if (l.blockHash) {
                  if (tsCache.has(l.blockHash)) {
                    ts = tsCache.get(l.blockHash)!
                  } else {
                    const blk = await publicClient.getBlock({ blockHash: l.blockHash })
                    ts = Number(blk.timestamp) * 1000
                    tsCache.set(l.blockHash, ts)
                  }
                }
              } catch {
                // ignore
              }

              const from = (l.args?.from as Address | undefined)?.toLowerCase()
              const to = (l.args?.to as Address | undefined)?.toLowerCase()
              const zero = '0x0000000000000000000000000000000000000000'
              const amount = Number(l.args?.value ?? 0n) / 1e18

              let side: Side = 'transfer'
              if (from === zero) side = 'buy' // mint -> buy
              else if (to === zero) side = 'sell' // burn -> sell

              return { ts, amount, price: null, side }
            })
          )

          txs = withTs.filter(t => t.amount > 0).sort((a, b) => a.ts - b.ts)
        }

        const windowed = range === 'all' ? txs : limitToWindow(txs, rangeMs)
        setTrades(windowed)
        setFeed(windowed.slice(-12).reverse())
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Failed to load trades')
      }

      if (!cancelled) timerRef.current = setTimeout(run, POLL_MS)
    }

    run()
    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [address, range, rangeMs])

  // Build candles with colored buy/sell volume
  const candles: Candle[] = useMemo(() => {
    if (trades.length === 0) return []
    const grouped: Record<number, Candle> = {}
    for (const t of trades) {
      const bucket = Math.floor(t.ts / FIXED_INTERVAL_MS) * FIXED_INTERVAL_MS
      if (!grouped[bucket]) grouped[bucket] = { ts: bucket, price: null, buyVol: 0, sellVol: 0 }
      if (typeof t.price === 'number') grouped[bucket].price = t.price
      if (t.side === 'sell') grouped[bucket].sellVol += t.amount
      else grouped[bucket].buyVol += t.amount
    }
    return Object.values(grouped).sort((a, b) => a.ts - b.ts)
  }, [trades])

  const data = useMemo(
    () =>
      candles.map(c => ({
        time: new Date(c.ts).toLocaleTimeString(),
        price: c.price,
        buyVol: c.buyVol,
        sellVol: c.sellVol,
      })),
    [candles]
  )

  const hasPrice = data.some(d => typeof d.price === 'number' && !Number.isNaN(d.price))

  return (
    <div className="trade-chart-wrap" style={{ paddingTop: 12, position: 'relative' }}>
      {/* top-right symbol label */}
      <div
        style={{
          position: 'absolute',
          right: 8,
          top: 8,
          color: '#9ae6b4',
          fontWeight: 600,
          fontSize: 12,
          zIndex: 2,
        }}
      >
        {symbol}
      </div>

      {/* Range buttons */}
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

      {/* Chart */}
      <div style={{ width: '100%', height: 300, marginTop: 44, paddingTop: 8 }}>
        {data.length === 0 ? (
          <div style={{ opacity: 0.7, padding: '8px 0', textAlign: 'center' }}>
            No trades yet in this range.
          </div>
        ) : (
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 4 }}>
              <XAxis dataKey="time" hide />
              <YAxis hide />
              <Tooltip />
              {/* stacked colored volume */}
              <Bar dataKey="buyVol" stackId="v" barSize={3} fill="#16a34a" />   {/* green */}
              <Bar dataKey="sellVol" stackId="v" barSize={3} fill="#dc2626" />  {/* red */}
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
          Showing colored volume inferred from ERC-20 transfers. Price line will appear when
          on-chain Trade events are present.
        </div>
      )}

      {/* Live feed (latest 12) */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Live Trades</div>
        {feed.length === 0 ? (
          <div style={{ opacity: 0.7, fontSize: 12 }}>No trades yet.</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
            {feed.map((t, i) => (
              <li
                key={`${t.ts}-${i}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 8px',
                  border: '1px solid #2a2a2a',
                  borderRadius: 6,
                  background: '#0f0f0f',
                }}
              >
                <span style={{ color: '#888' }}>{formatTime(t.ts)}</span>
                <span
                  style={{
                    color:
                      t.side === 'buy' ? '#16a34a' : t.side === 'sell' ? '#dc2626' : '#aaa',
                    fontWeight: 600,
                  }}
                >
                  {t.side.toUpperCase()}
                </span>
                <span style={{ color: '#ddd' }}>{t.amount.toLocaleString()} {symbol}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
