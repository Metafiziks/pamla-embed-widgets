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
const TokenABI = TokenJson.abi as Abi

type Pt = { x: number; y: number }
type Row = { blk: number; name?: string; y: number; keys: string[] }

const MAX_POINTS = 200
const POLL_MS = 6000

// Any event name here will be treated as a trade
const TRADE_LIKE = new Set([
  'Trade', 'Buy', 'Bought', 'TokensPurchased',
  'Sell', 'Sold', 'TokensSold',
])

function toFloat(bi?: bigint, decimals = 18) {
  if (typeof bi !== 'bigint') return undefined
  // convert to Number with decimal shift (ok for display)
  return Number(bi) / 10 ** decimals
}

// Try to compute a price from various arg shapes.
// Prefers an explicit price, else ratio of quote/base.
function computePrice(args: Record<string, any>) {
  // direct price fields
  const price =
    toFloat(args.priceAfter) ??
    toFloat(args.price) ??
    (typeof args.quotePerBase === 'bigint' ? toFloat(args.quotePerBase) : undefined)
  if (typeof price === 'number') return price

  // common amount pairs (try eth as quote, token as base)
  const ethIn = args.ethIn ?? args.eth ?? args.ethAmount ?? args.value
  const ethOut = args.ethOut
  const tokenIn = args.tokenIn ?? args.tokensIn ?? args.amountIn ?? args.tokenAmount
  const tokenOut = args.tokenOut ?? args.tokensOut ?? args.amountOut

  // Prefer ratio of quote/base in direction of a buy: ethIn / tokensOut
  const candidates: Array<[any, any]> = [
    [ethIn, tokenOut],
    [ethOut, tokenIn],
    [ethIn, tokenIn],
    [ethOut, tokenOut],
  ]

  for (const [q, b] of candidates) {
    if (typeof q === 'bigint' && typeof b === 'bigint' && b !== 0n) {
      const qf = toFloat(q)!, bf = toFloat(b)!
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

  const [points, setPoints] = useState<Pt[]>([])
  const [rows, setRows] = useState<Row[]>([])   // debug rows
  const [err, setErr] = useState<string | null>(null)

  const lastBlockRef = useRef<bigint | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function backfill() {
      setErr(null); setPoints([]); setRows([]); lastBlockRef.current = null
      try {
        const latest = await client.getBlockNumber()
        const span = 50_000n
        const fromBlock = latest > span ? latest - span : 0n

        const logs = await client.getLogs({ address, fromBlock, toBlock: latest })
        const parsed = parseEventLogs({ abi: TokenABI, logs, strict: false })

        const pts: Pt[] = []
        const table: Row[] = []

        for (const l of parsed) {
          if (!TRADE_LIKE.has(l.eventName || '')) continue
          const args: any = l.args || {}
          const y = computePrice(args)
          const blk = Number(l.blockNumber ?? 0n)
          pts.push({ x: blk, y })
          table.push({ blk, name: l.eventName, y, keys: Object.keys(args || {}) })
        }

        if (!cancelled) {
          pts.sort((a, b) => a.x - b.x)
          table.sort((a, b) => a.blk - b.blk)
          setPoints(pts.slice(-MAX_POINTS))
          setRows(table.slice(-5))  // keep last 5 for display
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
          const incomingPts: Pt[] = []
          const incomingRows: Row[] = []

          for (const l of parsed) {
            if (!TRADE_LIKE.has(l.eventName || '')) continue
            const args: any = l.args || {}
            const y = computePrice(args)
            const blk = Number(l.blockNumber ?? 0n)
            incomingPts.push({ x: blk, y })
            incomingRows.push({ blk, name: l.eventName, y, keys: Object.keys(args || {}) })
          }

          if (incomingPts.length) {
            setPoints(prev => {
              const merged = [...prev, ...incomingPts].sort((a, b) => a.x - b.x)
              // de-dup by block (keep last in block)
              const dedup: Pt[] = []
              for (const p of merged) {
                if (!dedup.length || dedup[dedup.length - 1].x !== p.x) dedup.push(p)
                else dedup[dedup.length - 1] = p
              }
              return dedup.slice(-MAX_POINTS)
            })

            setRows(prev => {
              const merged = [...prev, ...incomingRows].sort((a, b) => a.blk - b.blk)
              return merged.slice(-5)
            })
          }
        }

        lastBlockRef.current = latest
      } catch (e: any) {
        setErr(e?.message || 'Failed to poll live trades')
      } finally {
        if (!cancelled) timerRef.current = setTimeout(() => { void poll() }, POLL_MS)
      }
    }

    void backfill().then(() => { void poll() })

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [address, client])

  // UI
  if (err) return <div style={{ opacity: 0.9, color: '#ff9f9f' }}>⚠ {err}</div>
  if (!points.length) return <div style={{ opacity: 0.7 }}>No trades yet.</div>

  // Normalize if all y equal (prevent flat line looking odd)
  let ys = points.map(p => p.y)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  if (yMax - yMin === 0) {
    ys = points.map(() => points[0].y || 0)
  }

  const w = 600, h = 140, pad = 8
  const xs = points.map((p) => p.x)
  const xMin = Math.min(...xs), xMax = Math.max(...xs)
  const dx = xMax - xMin || 1
  const toX = (x: number) => pad + ((x - xMin) / dx) * (w - 2 * pad)
  const toY = (y: number) => {
    const ymin = Math.min(...ys), ymax = Math.max(...ys)
    const dy = (ymax - ymin) || (ymax || 1)
    return h - pad - ((y - ymin) / dy) * (h - 2 * pad)
  }
  const d = points
    .map((p, i) => `${i ? 'L' : 'M'} ${toX(p.x).toFixed(2)} ${toY(p.y).toFixed(2)}`)
    .join(' ')

  return (
    <div>
      <svg width={w} height={h}>
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      {/* tiny debug: last 5 parsed logs */}
      <div style={{fontSize:12, opacity:.85, marginTop:8}}>
        <div><b>Last events:</b></div>
        <ul style={{marginTop:4}}>
          {rows.map((r,i) => (
            <li key={i}>
              blk {r.blk} · {r.name ?? '(unknown)'} · y={r.y.toFixed(6)} · args: {r.keys.join(', ')}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
