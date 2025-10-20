'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Address } from 'viem'
import { parseAbiItem, createPublicClient, http } from 'viem'
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
import { abstractSepolia } from '@/lib/wagmi'

// ---------- Config ----------
const ABS_RPC =
  process.env.NEXT_PUBLIC_ABSTRACT_RPC || 'https://api.testnet.abs.xyz'

// poll fast enough to feel live but not spammy
const POLL_MS = 8_000

// fixed candle width (5m)
const FIXED_INTERVAL_MS = 5 * 60 * 1000

// time ranges
const RANGES = [
  { key: '1m', ms: 60 * 1000, label: '1m' },
  { key: '5m', ms: 5 * 60 * 1000, label: '5m' },
  { key: '1h', ms: 60 * 60 * 1000, label: '1h' },
  { key: '24h', ms: 24 * 60 * 60 * 1000, label: '24h' },
  { key: 'all', ms: Infinity, label: 'All' },
] as const
type RangeKey = (typeof RANGES)[number]['key']

// normalize ABI whether file is { abi:[...] } or the array
const TOKEN_ABI = (TokenAbiJson as any).abi ?? (TokenAbiJson as any)

// Minimal ERC-20 Transfer for fallback inference
const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from,address indexed to,uint256 value)'
)

// Native events from your curve/token (adjust names/args if you rename later)
const BUY_EVT = parseAbiItem(
  'event Buy(address buyer,uint256 ethIn,uint256 tokensOut)'
)
const SELL_EVT = parseAbiItem(
  'event Sell(address seller,uint256 amountIn,uint256 ethOut)'
)

// ---------- Types ----------
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

// ---------- Utils ----------
function formatTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ---------- Component ----------
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

  // dedicated public client (stable RPC)
  const pub = useMemo(
    () => createPublicClient({ chain: abstractSepolia, transport: http(ABS_RPC) }),
    []
  )

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
        const latest = await pub.getBlockNumber()

        // Keep block windows tight. Widen only for "all".
        // Abstract blocks are fast; 12k blocks ≈ short recent history.
        const span = range === 'all' ? 60_000n : 12_000n
        const fromBlock = latest > span ? latest - span : 0n

        // 1) Prefer native Buy/Sell events for true direction
        const logs = await pub.getLogs({
          address,
          fromBlock,
          toBlock: latest,
          events: [BUY_EVT, SELL_EVT],
        })

        // cache block timestamps by number to avoid N calls
        const uniqBlocks = Array.from(
          new Set(logs.map(l => l.blockNumber!).filter(Boolean))
        )
        const blockMap = new Map<bigint, number>()
        await Promise.all(
          uniqBlocks.map(async (bn) => {
            const b = await pub.getBlock({ blockNumber: bn })
            blockMap.set(bn, Number(b.timestamp) * 1000)
          })
        )

        let txs: TradeLike[] = (logs as any[]).map((l: any) => {
  const isBuy = l.eventName === 'Buy'
  const ts = blockMap.get(l.blockNumber!) ?? Date.now()
  const amount =
    Number(isBuy ? l.args.tokensOut : l.args.amountIn) / 1e18

  const side: Side = isBuy ? 'buy' : 'sell' // <- force literal type
  return { ts, amount, price: null, side }
})
.filter(t => t.amount > 0)
.sort((a, b) => a.ts - b.ts)


        // 2) Fallback: if no native trades (early blocks), infer from ERC-20 Transfer
        if (txs.length === 0) {
          const tLogs = await pub.getLogs({
            address,
            fromBlock,
            toBlock: latest,
            event: TRANSFER_EVENT,
          })

          // Avoid hammering timestamps; reuse cache by blockNumber
          const uniqTBlocks = Array.from(
            new Set(tLogs.map(l => l.blockNumber!).filter(Boolean))
          )
          await Promise.all(
            uniqTBlocks.map(async (bn) => {
              if (!blockMap.has(bn)) {
                const b = await pub.getBlock({ blockNumber: bn })
                blockMap.set(bn, Number(b.timestamp) * 1000)
              }
            })
          )

          const zero = '0x0000000000000000000000000000000000000000'
          txs = tLogs.slice(-300).map((l: any) => {
  const ts = blockMap.get(l.blockNumber!) ?? Date.now()
  const from = (l.args?.from as Address | undefined)?.toLowerCase()
  const to = (l.args?.to as Address | undefined)?.toLowerCase()
  const amount = Number(l.args?.value ?? 0n) / 1e18

  let side: Side = 'transfer'
  if (from === zero) side = 'buy'
  else if (to === zero) side = 'sell'

  return { ts, amount, price: null, side }
})
.filter(t => t.amount > 0)
.sort((a, b) => a.ts - b.ts)


        const windowed = range === 'all' ? txs : limitToWindow(txs, rangeMs)
        if (!cancelled) {
          setTrades(windowed)
          setFeed(windowed.slice(-12).reverse())
        }
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
  }, [address, range, rangeMs, pub])

  // Build candles with colored buy/sell volume
  const candles: Candle[] = useMemo(() => {
    if (trades.length === 0) return []
    const grouped: Record<number, Candle> = {}
    for (const t of trades) {
      const bucket = Math.floor(t.ts / FIXED_INTERVAL_MS) * FIXED_INTERVAL_MS
      if (!grouped[bucket]) grouped[bucket] = { ts: bucket, price: null, buyVol: 0, sellVol: 0 }
      if (t.side === 'sell') grouped[bucket].sellVol += t.amount
      else if (t.side === 'buy') grouped[bucket].buyVol += t.amount
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
          Showing colored volume inferred from events/transfers. Price line will appear when
          on-chain Trade events include price data.
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
                <span style={{ color: '#ddd' }}>
                  {t.amount.toLocaleString()} {symbol}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
