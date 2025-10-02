'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  createPublicClient,
  http,
  type Abi,
  type AbiEvent,
  parseEventLogs,
} from 'viem'
import { abstractSepolia } from '@/lib/wagmi'
import TokenJson from '@/lib/abi/BondingCurveToken.json'
const TokenABI = TokenJson.abi as Abi

type Pt = { x: number; y: number }

const MAX_POINTS = 200

// Heuristic: names often used by bonding-curve trades
const TRADE_LIKE = new Set([
  'Trade', 'Buy', 'Bought', 'TokensPurchased',
  'Sell', 'Sold', 'TokensSold',
])

// Pull all candidate trade events from ABI
function getTradeEventsFromAbi(abi: Abi): AbiEvent[] {
  return (abi as any[])
    .filter((e) => e?.type === 'event' && TRADE_LIKE.has(e.name))
    .map((e) => e as AbiEvent)
}

export default function TradeChart({ address }: { address: `0x${string}` }) {
  const client = useMemo(
    () => createPublicClient({ chain: abstractSepolia, transport: http(process.env.NEXT_PUBLIC_ABSTRACT_RPC || 'https://api.testnet.abs.xyz') }),
    []
  )

  const events = useMemo(() => getTradeEventsFromAbi(TokenABI), [])
  const [points, setPoints] = useState<Pt[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let unwatch: (() => void) | undefined

    async function run() {
      setErr(null)
      setPoints([])

      try {
        const latest = await client.getBlockNumber()
        const span = 50_000n
        const fromBlock = latest > span ? latest - span : 0n

        // Backfill: ask for all logs, then parse by ABI
        const logs = await client.getLogs({ address, fromBlock, toBlock: latest })
        const parsed = parseEventLogs({ abi: TokenABI, logs, strict: false })

        const backfill: Pt[] = parsed
          .filter((l) => TRADE_LIKE.has(l.eventName || ''))
          .map((l, i) => {
            const args: any = l.args || {}
            const priceAfter = args.priceAfter as bigint | undefined
            // If priceAfter exists, use it; else estimate as ethAmount/tokenAmount
            let y: number
            if (typeof priceAfter === 'bigint') y = Number(priceAfter) / 1e18
            else if (args.tokenAmount && args.ethAmount) {
              y = Number(args.ethAmount as bigint) / Math.max(1, Number(args.tokenAmount as bigint))
            } else y = 0
            const x = Number(l.blockNumber ?? 0n) || i
            return { x, y }
          })

        if (!cancelled) {
          const sorted = backfill.sort((a, b) => a.x - b.x).slice(-MAX_POINTS)
          setPoints(sorted)
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Failed to backfill trades')
      }

      try {
        // Live: subscribe to ALL trade-like events discovered in the ABI
        unwatch = await client.watchContractEvent({
          address,
          abi: TokenABI,
          eventName: events.length ? (events.map((e) => e.name) as any) : undefined, // undefined -> all events
          onLogs: (logs) => {
            const parsed = parseEventLogs({ abi: TokenABI, logs, strict: false })
            const incoming: Pt[] = parsed
              .filter((l) => TRADE_LIKE.has(l.eventName || ''))
              .map((l) => {
                const args: any = l.args || {}
                const priceAfter = args.priceAfter as bigint | undefined
                const x = Number(l.blockNumber ?? 0n)
                const y =
                  typeof priceAfter === 'bigint'
                    ? Number(priceAfter) / 1e18
                    : args.tokenAmount && args.ethAmount
                    ? Number(args.ethAmount as bigint) / Math.max(1, Number(args.tokenAmount as bigint))
                    : 0
                return { x, y }
              })

            setPoints((prev) => {
              const merged = [...prev, ...incoming].sort((a, b) => a.x - b.x)
              // de-dup by x
              const dedup: Pt[] = []
              for (const p of merged) {
                if (!dedup.length || dedup[dedup.length - 1].x !== p.x) dedup.push(p)
                else dedup[dedup.length - 1] = p
              }
              return dedup.slice(-MAX_POINTS)
            })
          },
          onError: (e) => setErr(e.message),
        })
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Failed to subscribe to live trades')
      }
    }

    run()
    return () => { cancelled = true; unwatch?.() }
  }, [address, client, events])

  if (err) return <div style={{ opacity: 0.9, color: '#ff9f9f' }}>⚠ {err}</div>
  if (!points.length) return <div style={{ opacity: 0.7 }}>No trades yet.</div>

  // Simple sparkline
  const w = 600, h = 140, pad = 8
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y)
  const xMin = Math.min(...xs), xMax = Math.max(...xs)
  const yMin = Math.min(...ys), yMax = Math.max(...ys)
  const dx = xMax - xMin || 1, dy = yMax - yMin || 1
  const toX = (x: number) => pad + ((x - xMin) / dx) * (w - 2 * pad)
  const toY = (y: number) => h - pad - ((y - yMin) / dy) * (h - 2 * pad)
  const d = points.map((p, i) => `${i ? 'L' : 'M'} ${toX(p.x).toFixed(2)} ${toY(p.y).toFixed(2)}`).join(' ')

  return <svg width={w} height={h}><path d={d} fill="none" stroke="currentColor" strokeWidth="2" /></svg>
}
