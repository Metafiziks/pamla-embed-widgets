'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createPublicClient,
  http,
  type Abi,
  parseEventLogs,
} from 'viem'
import { abstractSepolia } from '@/lib/wagmi'
import TokenJson from '@/lib/abi/BondingCurveToken.json'
// If your trade events are on the *curve* (not the token), keep using this ABI.
// If they’re on a separate Curve ABI file, swap it in here.
const TokenABI = TokenJson.abi as Abi

// Recharts
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

type TPoint = { t: number; price: number }   // t = blockNumber (or timestamp), price in ETH/token
type TFeed  = { blk: number; name: string; price: number; args: string[] }

const MAX_POINTS = 400            // keep a decent window
const POLL_MS = 6000              // 6s
const TRADE_NAMES = new Set(['Buy','Bought','Sell','Sold','TokensPurchased','TokensSold','Trade'])

// Convert bigint 18 decimals => JS number
function f18(x?: bigint) {
  if (typeof x !== 'bigint') return undefined
  // Note: Number(bigint)/1e18 is okay for charting (display), not for accounting.
  return Number(x) / 1e18
}

// Compute price from typical arg names; for your case, ethIn / tokensOut.
function computePrice(args: Record<string, any>): number {
  // preferred direct price fields if present
  const direct =
      f18(args.priceAfter) ??
      f18(args.price) ??
      (typeof args.quotePerBase === 'bigint' ? f18(args.quotePerBase) : undefined)
  if (typeof direct === 'number') return direct

  // common pairs
  const ethIn     = args.ethIn     ?? args.ethAmount ?? args.eth ?? args.value
  const ethOut    = args.ethOut
  const tokensIn  = args.tokensIn  ?? args.tokenIn  ?? args.amountIn  ?? args.tokenAmount
  const tokensOut = args.tokensOut ?? args.tokenOut ?? args.amountOut

  // Your debug shows: buyer, ethIn, tokensOut
  const candidates: Array<[any, any]> = [
    [ethIn, tokensOut], // ✅ your main case
    [ethOut, tokensIn],
    [ethIn, tokensIn],
    [ethOut, tokensOut],
  ]

  for (const [q, b] of candidates) {
    if (typeof q === 'bigint' && typeof b === 'bigint' && b !== 0n) {
      const qf = f18(q)!, bf = f18(b)!
      if (bf > 0) return qf / bf
    }
  }
  return 0
}

export default function TradeChart({ address }: { address: `0x${string}` }) {
  const client = useMemo(
    () => createPublicClient({
      chain: abstractSepolia,
      transport: http(process.env.NEXT_PUBLIC_ABSTRACT_RPC || 'https://api.testnet.abs.xyz'),
    }),
    []
  )

  const [data, setData] = useState<TPoint[]>([])
  const [feed, setFeed] = useState<TFeed[]>([])
  const [err, setErr] = useState<string | null>(null)

  const lastBlockRef = useRef<bigint | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function backfill() {
      setErr(null); setData([]); setFeed([]); lastBlockRef.current = null
      try {
        const latest = await client.getBlockNumber()
        const span = 50_000n
        const fromBlock = latest > span ? latest - span : 0n

        const logs = await client.getLogs({ address, fromBlock, toBlock: latest })
        const parsed = parseEventLogs({ abi: TokenABI, logs, strict: false })

        const pts: TPoint[] = []
        const rows: TFeed[] = []

        for (const l of parsed) {
          const name = l.eventName || ''
          if (!TRADE_NAMES.has(name)) continue
          const args: any = l.args || {}
          const price = computePrice(args)
          const blk = Number(l.blockNumber ?? 0n)
          pts.push({ t: blk, price })
          rows.push({ blk, name, price, args: Object.keys(args) })
        }

        if (!cancelled) {
          pts.sort((a, b) => a.t - b.t)
          rows.sort((a, b) => a.blk - b.blk)
          setData(pts.slice(-MAX_POINTS))
          setFeed(rows.slice(-8)) // last 8 rows
          lastBlockRef.current = latest
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Failed to backfill trades')
      }
    }

    async function poll() {
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

          const incomingPts: TPoint[] = []
          const incomingRows: TFeed[] = []

          for (const l of parsed) {
            const name = l.eventName || ''
            if (!TRADE_NAMES.has(name)) continue
            const args: any = l.args || {}
            const price = computePrice(args)
            const blk = Number(l.blockNumber ?? 0n)
            incomingPts.push({ t: blk, price })
            incomingRows.push({ blk, name, price, args: Object.keys(args) })
          }

          if (incomingPts.length) {
            setData(prev => {
              const merged = [...prev, ...incomingPts].sort((a, b) => a.t - b.t)
              // de-dup per block number
              const dedup: TPoint[] = []
              for (const p of merged) {
                if (!dedup.length || dedup[dedup.length - 1].t !== p.t) dedup.push(p)
                else dedup[dedup.length - 1] = p
              }
              return dedup.slice(-MAX_POINTS)
            })
            setFeed(prev => {
              const merged = [...prev, ...incomingRows].sort((a, b) => a.blk - b.blk)
              return merged.slice(-8)
            })
          }
        }

        lastBlockRef.current = latest
      } catch (e: any) {
        setErr(e?.message || 'Failed to poll live trades')
      } finally {
        if (!cancelled) {
          timerRef.current = setTimeout(() => { void poll() }, POLL_MS)
        }
      }
    }

    void backfill().then(() => { void poll() })

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [address, client])

  // ----- UI -----
  return (
    <div>
      {err && <div style={{color:'#ff9f9f', marginBottom:8}}>⚠ {err}</div>}

      {/* Ticker line chart (blocks on X, price on Y) */}
      <div style={{width:'100%', height:240}}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeOpacity={0.15} />
            <XAxis
              dataKey="t"
              tick={{ fontSize: 12 }}
              axisLine={{ opacity: 0.3 }}
              tickLine={{ opacity: 0.3 }}
              tickFormatter={(v) => String(v)}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              axisLine={{ opacity: 0.3 }}
              tickLine={{ opacity: 0.3 }}
              domain={['auto', 'auto']}
              tickFormatter={(v) => v.toFixed(4)}
            />
            <Tooltip
              formatter={(v: any) => [Number(v).toFixed(6) + ' ETH/token', 'Price']}
              labelFormatter={(l: any) => `Block ${l}`}
            />
            <Line type="monotone" dataKey="price" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Recent event feed */}
      <div style={{fontSize:12, opacity:.9, marginTop:12}}>
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
