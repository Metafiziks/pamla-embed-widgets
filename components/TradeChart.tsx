'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createPublicClient,
  http,
  type Abi,
  parseEventLogs,
  Hex,
} from 'viem'
import { abstractSepolia } from '@/lib/wagmi'

// Recharts
import {
  ComposedChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Bar,
  Rectangle,
} from 'recharts'

import TokenJson from '@/lib/abi/BondingCurveToken.json'
const TokenABI = TokenJson.abi as Abi

type Trade = {
  ts: number      // unix ms
  blk: number
  price: number   // ETH per token
  tx: Hex
  name: string
  args: string[]
}
type Candle = {
  t: number       // bucket start unix ms
  open: number
  high: number
  low: number
  close: number
  count: number
}

const POLL_MS = 6000
const TRADE_NAMES = new Set(['Buy','Bought','Sell','Sold','TokensPurchased','TokensSold','Trade'])
const RPC = process.env.NEXT_PUBLIC_ABSTRACT_RPC || 'https://api.testnet.abs.xyz'

// ---- Helpers ----
function f18(x?: bigint) { return typeof x === 'bigint' ? Number(x) / 1e18 : undefined }
// Your ABI: Buy(buyer, ethIn, tokensOut) -> price = ethIn / tokensOut
function computePrice(args: Record<string, any>) {
  const ethIn = args.ethIn ?? args.eth ?? args.ethAmount ?? args.value
  const tokensOut = args.tokensOut ?? args.tokenOut ?? args.amountOut
  if (typeof ethIn === 'bigint' && typeof tokensOut === 'bigint' && tokensOut !== 0n) {
    return (f18(ethIn)! / f18(tokensOut)!)
  }
  const direct = f18(args.priceAfter) ?? f18(args.price)
  return typeof direct === 'number' ? direct : 0
}

// Candle interval options
const INTERVALS = [
  { key: '1m', ms: 60_000 },
  { key: '5m', ms: 5 * 60_000 },
  { key: '15m', ms: 15 * 60_000 },
] as const
type IntervalKey = typeof INTERVALS[number]['key']

// Time range window options
const RANGES = [
  { key: '1h', ms: 1 * 60 * 60 * 1000 },
  { key: '4h', ms: 4 * 60 * 60 * 1000 },
  { key: '24h', ms: 24 * 60 * 60 * 1000 },
] as const
type RangeKey = typeof RANGES[number]['key']

export default function TradeChart({
  address,
  symbol = '$PAMLA',
  defaultInterval = '1m',
  defaultRange = '24h',
}: {
  address: `0x${string}`
  symbol?: string
  defaultInterval?: IntervalKey
  defaultRange?: RangeKey
}) {
  const client = useMemo(
    () => createPublicClient({ chain: abstractSepolia, transport: http(RPC) }),
    []
  )

  const [interval, setInterval] = useState<IntervalKey>(defaultInterval)
  const intervalMs = INTERVALS.find(i => i.key === interval)!.ms

  const [range, setRange] = useState<RangeKey>(defaultRange)
  const rangeMs = RANGES.find(r => r.key === range)!.ms

  // Keep raw trades (we’ll re-bucket when interval/range changes)
  const [trades, setTrades] = useState<Trade[]>([])
  const [feed, setFeed] = useState<Trade[]>([])
  const [err, setErr] = useState<string | null>(null)

  const lastBlockRef = useRef<bigint | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blockTimeCache = useRef<Map<bigint, number>>(new Map()) // blk -> unix ms

  const getBlockTime = async (blockNumber: bigint) => {
    const c = blockTimeCache.current.get(blockNumber)
    if (c) return c
    const b = await client.getBlock({ blockNumber })
    const ts = Number(b.timestamp) * 1000
    blockTimeCache.current.set(blockNumber, ts)
    return ts
  }

  // Limit an array of trades to a moving window ending "now", with a hard cap for memory
  function limitToWindow(list: Trade[], windowMs: number) {
    const cutoff = Date.now() - windowMs
    let i = list.findIndex(t => t.ts >= cutoff)
    if (i === -1) i = Math.max(0, list.length - 5000) // emergency cap
    return list.slice(i)
  }

  // ---- Backfill + poll trades (pure getLogs; no filters) ----
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setErr(null); setTrades([]); setFeed([]); lastBlockRef.current = null

      try {
        const latest = await client.getBlockNumber()
        // Backfill enough history to cover 24h+ comfortably
        const span = 80_000n
        const fromBlock = latest > span ? latest - span : 0n

        const logs = await client.getLogs({ address, fromBlock, toBlock: latest })
        const parsed = parseEventLogs({ abi: TokenABI, logs, strict: false })

        const backfill: Trade[] = []
        for (const l of parsed) {
          const name = l.eventName || ''
          if (!TRADE_NAMES.has(name)) continue
          const args: any = l.args || {}
          const price = computePrice(args)
          const blk = l.blockNumber ?? 0n
          const ts  = await getBlockTime(blk)
          backfill.push({
            ts, blk: Number(blk), price,
            tx: l.transactionHash as Hex, name, args: Object.keys(args || {}),
          })
        }
        if (!cancelled) {
          backfill.sort((a,b)=>a.ts-b.ts)
          const windowed = limitToWindow(backfill, 24 * 60 * 60 * 1000) // store max ~24h in memory
          setTrades(windowed)
          setFeed(backfill.slice(-8))
          lastBlockRef.current = latest
        }
      } catch (e:any) {
        if (!cancelled) setErr(e?.message || 'Failed to backfill trades')
      }

      const loop = async () => {
        if (cancelled) return
        try {
          const latest = await client.getBlockNumber()
          const fromBlock =
            lastBlockRef.current && latest > lastBlockRef.current
              ? lastBlockRef.current + 1n
              : latest

          if (fromBlock <= latest) {
            const logs = await client.getLogs({ address, fromBlock, toBlock: latest })
            const parsed = parseEventLogs({ abi: TokenABI, logs, strict: false })

            const incoming: Trade[] = []
            for (const l of parsed) {
              const name = l.eventName || ''
              if (!TRADE_NAMES.has(name)) continue
              const args: any = l.args || {}
              const price = computePrice(args)
              const blk = l.blockNumber ?? 0n
              const ts  = await getBlockTime(blk)
              incoming.push({
                ts, blk: Number(blk), price,
                tx: l.transactionHash as Hex, name, args: Object.keys(args || {}),
              })
            }
            if (incoming.length) {
              incoming.sort((a,b)=>a.ts-b.ts)
              setTrades(prev => limitToWindow([...prev, ...incoming], 24*60*60*1000)) // keep ≤24h in memory
              setFeed(prev => [...prev, ...incoming].slice(-8))
            }
          }
          lastBlockRef.current = latest
        } catch (e:any) {
          setErr(e?.message || 'Failed to poll live trades')
        } finally {
          timerRef.current = setTimeout(loop, POLL_MS)
        }
      }
      timerRef.current = setTimeout(loop, POLL_MS)
    }

    run()
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [address, client])

  // ---- Recompute candles for the selected interval & range ----
  const candles: Candle[] = useMemo(() => {
    const cutoff = Date.now() - rangeMs
    const windowed = trades.filter(t => t.ts >= cutoff)

    const byBucket = new Map<number, Candle>()
    for (const tr of windowed) {
      const bucket = Math.floor(tr.ts / intervalMs) * intervalMs
      const cur = byBucket.get(bucket)
      if (!cur) {
        byBucket.set(bucket, { t: bucket, open: tr.price, high: tr.price, low: tr.price, close: tr.price, count: 1 })
      } else {
        cur.high = Math.max(cur.high, tr.price)
        cur.low  = Math.min(cur.low, tr.price)
        cur.close = tr.price
        cur.count += 1
      }
    }
    return [...byBucket.values()].sort((a,b)=>a.t-b.t)
  }, [trades, intervalMs, rangeMs])

  // ---- Last price & Δ over the selected range ----
  const lastClose = candles.length > 0 ? candles[candles.length - 1].close : undefined
  const firstInRange = candles[0]?.open ?? candles[0]?.close
  const deltaPct = (lastClose !== undefined && firstInRange !== undefined && firstInRange > 0)
    ? ((lastClose - firstInRange) / firstInRange) * 100
    : undefined

  // ---- UI ----
  const data = candles.map(c => ({ ...c, x: c.t }))

  return (
    <div style={{ position:'relative' }}>
      {/* Left controls: interval & range */}
      <div style={{ position:'absolute', left:8, top:8, display:'flex', gap:8, flexWrap:'wrap' }}>
        <div>
          {INTERVALS.map(i => (
            <button
              type="button"
              key={i.key}
              onClick={() => setInterval(i.key)}
              style={{
                padding:'4px 8px', border:'1px solid #2a2a2a', borderRadius:9999,
                background: interval === i.key ? '#1f1f22' : '#151515',
                color:'#fff', fontSize:12, cursor:'pointer', marginRight:6
              }}
            >
              {i.key}
            </button>
          ))}
        </div>
        <div>
          {RANGES.map(r => (
            <button
              type="button"
              key={r.key}
              onClick={() => setRange(r.key)}
              style={{
                padding:'4px 8px', border:'1px solid #2a2a2a', borderRadius:9999,
                background: range === r.key ? '#1f1f22' : '#151515',
                color:'#fff', fontSize:12, cursor:'pointer', marginRight:6
              }}
            >
              {r.key}
            </button>
          ))}
        </div>
      </div>

      {/* Right badge: symbol + last + Δ over selected range */}
      <div style={{ position:'absolute', right:8, top:8, display:'flex', gap:8, alignItems:'center' }}>
        <span style={{ padding:'4px 8px', border:'1px solid #2a2a2a', borderRadius:9999, background:'#151515', fontSize:12 }}>
          {symbol}
        </span>
        <span style={{ fontSize:12, opacity:.9 }}>
          {lastClose !== undefined ? lastClose.toFixed(6) + ' ETH' : '—'}
        </span>
        <span
          style={{
            fontSize:12,
            color: deltaPct === undefined ? '#aaa'
                  : deltaPct >= 0 ? '#3ddc97' : '#ff7a7a',
          }}
          title={`Change over ${range}`}
        >
          {deltaPct === undefined ? '—' : `${deltaPct >= 0 ? '▲' : '▼'} ${Math.abs(deltaPct).toFixed(2)}%`}
        </span>
      </div>

      {/* Candles */}
      <div style={{ width:'100%', height:300, marginTop:36, overflow:'hidden' }}>

{data.length === 0 ? (
  <div style={{opacity:.7, padding:'8px 0'}}>No trades yet in this range.</div>
) : (
        <ResponsiveContainer>
          <ComposedChart data={data}>
            <CartesianGrid strokeOpacity={0.15} />
            <XAxis
              dataKey="x"
              tick={{ fontSize: 12 }}
              axisLine={{ opacity: 0.3 }}
              tickLine={{ opacity: 0.3 }}
              tickFormatter={(v) => new Date(Number(v)).toLocaleTimeString()}
            />
            <YAxis
  yAxisId="price"
  tick={{ fontSize: 12 }}
  axisLine={{ opacity: 0.3 }}
  tickLine={{ opacity: 0.3 }}
  domain={([min, max]) => {
    if (min === max) {
      const pad = min * 0.01 || 0.000001
      return [min - pad, max + pad]
    }
    const pad = (max - min) * 0.05
    return [min - pad, max + pad]
  }}
/>

            <Tooltip
              formatter={(_: any, __: any, p: any) => {
                const c = p?.payload as Candle
                return [
                  `O:${c.open.toFixed(6)}  H:${c.high.toFixed(6)}  L:${c.low.toFixed(6)}  C:${c.close.toFixed(6)} (${c.count})`,
                  'Candle',
                ]
              }}
              labelFormatter={(l:any) => new Date(Number(l)).toLocaleTimeString()}
            />
            {/* candle via custom Bar shape */}
            <Bar
  yAxisId="price"
  dataKey="close"
  fill="transparent"
  shape={(props: any) => {
    const { x, width, payload } = props
const c: Candle = payload

// Prefer a few places where Recharts puts the scale:
const yScale =
  props?.yAxis?.scale ||
  props?.yAxis?.axis?.scale ||
  props?.yAxis?.yAxisScale ||
  null
if (!yScale) return null

const yOpen  = yScale(c.open)
const yClose = yScale(c.close)
const yHigh  = yScale(c.high)
const yLow   = yScale(c.low)

const vals = [yOpen, yClose, yHigh, yLow]
if (vals.some(v => typeof v !== 'number' || !isFinite(v))) return null

const candleW = Math.max(3, Math.min(12, width * 0.6))
const cx = x + width / 2 - candleW / 2
const color = c.close >= c.open ? '#3ddc97' : '#ff7a7a'

// wick
const wickY = Math.min(yHigh, yLow)
const wickH = Math.abs(yLow - yHigh) || 2

// body (ensure ≥2 px so it’s visible even when open===close)
const bodyY = Math.min(yOpen, yClose)
const rawH  = Math.abs(yClose - yOpen)
const bodyH = rawH < 2 ? 2 : rawH

return (
  <g>
    {/* wick */}
    <Rectangle x={x + width / 2 - 1} y={wickY} width={2} height={wickH} fill={color} />
    {/* body */}
    <Rectangle x={cx} y={bodyY} width={candleW} height={bodyH} fill={color} />
    {/* baseline for ultra-flat candles (nice visual hint) */}
    <Rectangle x={cx} y={bodyY + Math.max(0, bodyH - 1)} width={candleW} height={1} fill={color} />
  </g>
)

  }}
/>

          </ComposedChart>
        </ResponsiveContainer>
)}
      </div>

      {/* Recent trades feed (last 8) */}
      <div style={{fontSize:12, opacity:.9, marginTop:12, maxHeight:140, overflowY:'auto'}}>
        <div><b>Last events:</b></div>
        {feed.length === 0 ? (
          <div>No trades yet.</div>
        ) : (
          <ul style={{marginTop:4}}>
            {feed.slice().reverse().map((r, i) => (
              <li key={i}>
                blk {r.blk} · {r.name} · price={r.price.toFixed(6)} · args: {r.args.join(', ')}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
