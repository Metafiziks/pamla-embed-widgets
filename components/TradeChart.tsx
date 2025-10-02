'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  createPublicClient,
  http,
  parseAbiItem,
  type AbiEvent,
} from 'viem'
import { abstractSepolia } from '@/lib/wagmi'

type Pt = { x: number; y: number }

const TRADE_EVENT = parseAbiItem(
  'event Trade(address indexed user, bool isBuy, uint256 ethAmount, uint256 tokenAmount, uint256 priceAfter, uint256 timestamp)'
) as AbiEvent

const MAX_POINTS = 200 // keep the chart snappy

export default function TradeChart({ address }: { address: `0x${string}` }) {
  const client = useMemo(
    () =>
      createPublicClient({
        chain: abstractSepolia,
        transport: http(process.env.NEXT_PUBLIC_ABSTRACT_RPC || 'https://api.testnet.abs.xyz'),
      }),
    []
  )

  const [points, setPoints] = useState<Pt[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let unwatch: (() => void) | undefined

    async function run() {
      setErr(null)
      setPoints([])

      try {
        // -------- Backfill recent logs (last ~50k blocks) --------
        const latest = await client.getBlockNumber()
        const span = 50_000n
        const fromBlock = latest > span ? latest - span : 0n

        const logs = await client.getLogs({
          address,
          events: [TRADE_EVENT],
          fromBlock,
          toBlock: latest,
        })

        const backfill = logs.map((l, i) => {
          const args: any = l.args || {}
          const priceAfter = args.priceAfter as bigint | undefined
          // fall back to tokenAmount/ethAmount ratio if priceAfter is missing
          let y: number
          if (typeof priceAfter === 'bigint') y = Number(priceAfter) / 1e18
          else if (args.tokenAmount && args.ethAmount) {
            y = Number(args.ethAmount as bigint) / Number(args.tokenAmount as bigint)
          } else y = 0

          // Use block number as x; if missing, use index
          const x = Number(l.blockNumber ?? 0n) || i
          return { x, y }
        })

        if (!cancelled) {
          // sort by x just in case, and cap length
          const sorted = backfill.sort((a, b) => a.x - b.x).slice(-MAX_POINTS)
          setPoints(sorted)
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Failed to backfill trades')
      }

      try {
        // -------- Subscribe to new Trade events (live) --------
        unwatch = await client.watchContractEvent({
          address,
          abi: [TRADE_EVENT],
          eventName: 'Trade',
          onLogs: (logs) => {
            setPoints((prev) => {
              const incoming: Pt[] = logs.map((l: any) => {
                const args = l.args || {}
                const priceAfter = args.priceAfter as bigint | undefined
                const x = Number(l.blockNumber ?? 0n)
                const y =
                  typeof priceAfter === 'bigint'
                    ? Number(priceAfter) / 1e18
                    : args.tokenAmount && args.ethAmount
                    ? Number(args.ethAmount as bigint) / Number(args.tokenAmount as bigint)
                    : 0
                return { x, y }
              })
              const merged = [...prev, ...incoming].sort((a, b) => a.x - b.x)
              // de-dup by x (block), keep last value per block
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
    return () => {
      cancelled = true
      unwatch?.()
    }
  }, [address, client])

  if (err) {
    return <div style={{ opacity: 0.9, color: '#ff9f9f' }}>⚠ {err}</div>
  }

  if (!points.length) return <div style={{ opacity: 0.7 }}>No trades yet.</div>

  // --------- Simple sparkline renderer ---------
  const w = 600,
    h = 140,
    pad = 8
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y)
  const xMin = Math.min(...xs),
    xMax = Math.max(...xs)
  const yMin = Math.min(...ys),
    yMax = Math.max(...ys)
  const dx = xMax - xMin || 1
  const dy = yMax - yMin || 1
  const toX = (x: number) => pad + ((x - xMin) / dx) * (w - 2 * pad)
  const toY = (y: number) => h - pad - ((y - yMin) / dy) * (h - 2 * pad)
  const d = points
    .map((p, i) => `${i ? 'L' : 'M'} ${toX(p.x).toFixed(2)} ${toY(p.y).toFixed(2)}`)
    .join(' ')

  return <svg width={w} height={h}><path d={d} fill="none" stroke="currentColor" strokeWidth="2" /></svg>
}
