'use client'
import { useEffect, useMemo, useState } from 'react'
import { createPublicClient, http, parseAbiItem } from 'viem'
import { abstractSepolia } from '../lib/wagmi'

type Pt = { x: number; y: number }

const tradeEvent = parseAbiItem('event Trade(address indexed user, bool isBuy, uint256 ethAmount, uint256 tokenAmount, uint256 priceAfter, uint256 timestamp)')

export default function TradeChart({ address }: { address: `0x${string}` }) {
  const client = useMemo(() => createPublicClient({ chain: abstractSepolia, transport: http(process.env.NEXT_PUBLIC_ABSTRACT_RPC || 'https://api.testnet.abs.xyz') }), [])
  const [points, setPoints] = useState<Pt[]>([])

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const logs = await client.getLogs({ address, events: [tradeEvent], fromBlock: 'earliest' })
        const pts = logs.map((l, i) => {
          const price = (l.args as any).priceAfter as bigint
          return { x: i, y: Number(price) / 1e18 }
        })
        setPoints(pts.slice(-80))
      } catch (e) { console.error(e) }
    }
    fetchLogs()
  }, [address, client])

  if (!points.length) return <div style={{opacity:.7}}>No trades yet.</div>

  const w = 600, h = 140, pad = 8
  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  const xMin = Math.min(...xs), xMax = Math.max(...xs)
  const yMin = Math.min(...ys), yMax = Math.max(...ys)
  const dx = xMax - xMin || 1
  const dy = yMax - yMin || 1
  const toX = (x:number) => pad + ((x - xMin)/dx) * (w - 2*pad)
  const toY = (y:number) => h - pad - ((y - yMin)/dy) * (h - 2*pad)
  const d = points.map((p,i)=>`${i?'L':'M'} ${toX(p.x).toFixed(2)} ${toY(p.y).toFixed(2)}`).join(' ')

  return <svg width={w} height={h}><path d={d} fill="none" stroke="currentColor" strokeWidth="2"/></svg>
}
