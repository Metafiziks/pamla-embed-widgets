'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
const POLL_MS = 6000n // 6s

// Heuristic: names often used by bonding-curve trades (adjust to your ABI)
const TRADE_LIKE = new Set([
  'Trade', 'Buy', 'Bought', 'TokensPurchased',
  'Sell', 'Sold', 'TokensSold',
])

function isTradeLike(name?: string) {
  return !!name && TRADE_LIKE.has(name)
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
  const [err, setErr] = useState<string | null>(null)

  // Track the last block we processed to avoid duplicates
  const lastBlockRef = useRef<bigint | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function backfill() {
      setErr(null)
      setPoints([])
      lastBlockRef.current = null

      try {
        const latest = await client.getBlockNumber()
        const span = 50_000n
        const fromBlock = latest > span ? latest - span : 0n

        const logs = await client.getLogs({ address, fromBlock, toBlock: latest })
        const parsed = parseEventLogs({ abi: TokenABI, logs, strict: false })

        const backfill: Pt[] = parsed
          .filter((l) => isTradeLike(l.eventName))
          .map((l, i) => {
            const args: any = l.args || {}
            const priceAfter = args.priceAfter as bigint | undefined
            const y =
              typeof priceAfter === 'bigint'
                ? Number(priceAfter) / 1e18
                : (args.ethAmount && args.tokenAmount)
                ? Number(args.ethAmount as bigint) / Math.max(1, Number(args.tokenAmount as bigint))
                : 0
            const x = Number(l.blockNumber ?? 0n) || i
            return { x, y }
          })

        if (!cancelled) {
          const sorted = backfill.sort((a, b) => a.x - b.x).slice(-MAX_POINTS)
          setPoints(sorted)
          // set last processed block
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
        // figure out where to start
        const fromBlock =
          lastBlockRef.current && latest > lastBlockRef.current
            ? lastBlockRef.current + 1n
            : latest

        if (fromBlock <= latest) {
          const logs = await client.getLogs({ address, fromBlock, toBlock: latest })
          const parsed = parseEventLogs({ abi: TokenABI, logs, strict: false })

          const incoming: Pt[] = parsed
            .filter((l) => isTradeLike(l.eventName))
            .map((l) => {
              const args: any = l.args || {}
              const priceAfter = args.priceAfter as bigint | undefined
              const x = Number(l.blockNumber ?? 0n)
              const y =
                typeof priceAfter === 'bigint'
                  ? Number(priceAfter) / 1e18
                  : (args.ethAmount && args.tokenAmount)
                  ? Number(args.ethAmount as bigint) / Math.max(1, Number(args.tokenAmount as bigint))
                  : 0
              return { x, y }
            })

          if (incoming.length) {
            setPoints((prev) => {
              const merged = [...prev, ...incoming].sort((a, b) => a.x - b.x)
              // de-dup by block number
              const dedup: Pt[] = []
              for (const p of merged) {
                if (!dedup.length || dedup[dedup.length - 1].x !== p.x) dedup.push(p)
                else dedup[dedup.length - 1] = p
              }
              return dedup.slice(-MAX_POINTS)
            })
          }
        }

        // update last processed block
        lastBlockRef.current = latest
      } catch (e: any) {
        setErr(e?.message || 'Failed to poll live trades')
      } finally {
        if (!cancelled) {
          // schedule next poll (no filters involved)
          timerRef.current = setTimeout(() => { void poll() }, Number(POLL_MS))
        }
      }
    }

    // run
    void backfill().then(() => { void poll() })

    // cleanup
    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [address, client])

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
