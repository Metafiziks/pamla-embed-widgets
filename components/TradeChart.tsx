'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { parseEventLogs, type Log, type Address } from 'viem'
import { ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar } from 'recharts'

import TokenAbiJson from '@/lib/abi/BondingCurveToken.json'
import { publicClient } from '@/lib/viem'

// Normalize ABI whether the JSON has { abi: [...] } or is already the array
const TOKEN_ABI = (TokenAbiJson as any).abi ?? (TokenAbiJson as any)

const INTERVALS = [
  { key: '1m', ms: 60 * 1000, label: '1m' },
  { key: '5m', ms: 5 * 60 * 1000, label: '5m' },
  { key: '1h', ms: 60 * 60 * 1000, label: '1h' },
  { key: '24h', ms: 24 * 60 * 60 * 1000, label: '24h' },
] as const

const RANGES = [
  { key: '1m', ms: 60 * 1000, label: '1m' },
  { key: '5m', ms: 5 * 60 * 1000, label: '5m' },
  { key: '1h', ms: 60 * 60 * 1000, label: '1h' },
  { key: '24h', ms: 24 * 60 * 60 * 1000, label: '24h' },
  { key: 'all', ms: Infinity, label: 'All' },
] as const

type IntervalKey = (typeof INTERVALS)[number]['key']
type RangeKey = (typeof RANGES)[number]['key']

interface Trade {
  ts: number
  price: number
  amount: number
}

interface Candle {
  ts: number
  price: number
  volume: number
}

const POLL_MS = 30_000

export default function TradeChart({
  address,
  symbol = '$PAMLA',
  defaultInterval = '1m',
  defaultRange = 'all',
}: {
  address: `0x${string}`
  symbol?: string
  defaultInterval?: IntervalKey
  defaultRange?: RangeKey
}) {
  const client = publicClient

  const [interval, setInterval] = useState<IntervalKey>(defaultInterval)
  const [range, setRange] = useState<RangeKey>(defaultRange)
  const intervalMs = INTERVALS.find(i => i.key === interval)!.ms
  const rangeMs = RANGES.find(r => r.key === range)!.ms

  const [trades, setTrades] = useState<Trade[]>([])
  const [feed, setFeed] = useState<Trade[]>([])
  const [err, setErr] = useState<string | null>(null)

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const lastBlockRef = useRef<bigint | null>(null)

  function limitToWindow(list: Trade[], windowMs: number) {
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
      setTrades([])
      setFeed([])
      lastBlockRef.current = null

      try {
        const latest = await publicClient.getBlockNumber()
        // pull a reasonably big window of blocks; 'all' just means "larger window", not infinite
        const span = range === 'all' ? 250_000n : 80_000n
        const fromBlock = latest > span ? latest - span : 0n

        // grab logs first (no event filter; we’ll parse with ABI right after)
        const logs = await publicClient.getLogs({
          address: address as Address,
          fromBlock,
          toBlock: latest,
        })

        const parsed = parseEventLogs({ abi: TOKEN_ABI, logs, strict: false })

        // If your ABI has a Trade-like event, this will pick it up.
        // Otherwise, this remains empty and you’ll only see “No trades yet”.
        const txs: Trade[] = parsed
          .filter((l: any) => l.eventName === 'Trade' || l.eventName === 'Traded' || l.eventName === 'Buy' || l.eventName === 'Sell')
          .map((l: any) => ({
            ts: Number(l.args?.timestamp ?? (l.blockTimestamp ? Number(l.blockTimestamp) * 1000 : Date.now())),
            price: Number(l.args?.price ?? 0),
            amount: Number(l.args?.amount ?? l.args?.tokensOut ?? 0),
          }))
          .sort((a: any, b: any) => a.ts - b.ts)

        const windowed = range === 'all' ? txs : limitToWindow(txs, rangeMs)
        setTrades(windowed)
        setFeed(windowed.slice(-8))
        lastBlockRef.current = latest
        // eslint-disable-next-line no-console
        console.debug('[chart] backfill trades=', windowed.length)
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Failed to backfill trades')
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

  const candles: Candle[] = useMemo(() => {
    if (trades.length === 0) return []
    const grouped: Record<number, Candle> = {}
    for (const t of trades) {
      const bucket = Math.floor(t.ts / intervalMs) * intervalMs
      if (!grouped[bucket]) {
        grouped[bucket] = { ts: bucket, price: t.price, volume: 0 }
      }
      grouped[bucket].price = t.price
      grouped[bucket].volume += t.amount
    }
    return Object.values(grouped).sort((a, b) => a.ts - b.ts)
  }, [trades, intervalMs])

  const data = useMemo(
    () => candles.map(c => ({ time: new Date(c.ts).toLocaleTimeString(), ...c })),
    [candles]
  )

  return (
    <div className="trade-chart-wrap" style={{ paddingTop: 12 }}>
      <div
        className="chart-controls"
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}
      >
        {INTERVALS.map(i => (
          <button
            key={i.key}
            onClick={() => setInterval(i.key)}
            style={{
              background: interval === i.key ? '#333' : '#1a1a1a',
              color: '#fff',
              borderRadius: 4,
              padding: '4px 8px',
              border: '1px solid #444',
              cursor: 'pointer',
            }}
          >
            {i.label}
          </button>
        ))}
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
              <Line
                type="monotone"
                dataKey="price"
                stroke="#00ffb3"
                dot={false}
                strokeWidth={2}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {err && (
        <div style={{ color: 'tomato', marginTop: 6, fontSize: 12, textAlign: 'center' }}>
          ⚠ {err}
        </div>
      )}
    </div>
  )
}
