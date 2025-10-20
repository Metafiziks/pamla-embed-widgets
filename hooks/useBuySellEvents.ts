// hooks/useBuySellEvents.ts
import { useEffect, useMemo, useState } from 'react'
import { createPublicClient, http, parseAbiItem } from 'viem'
import type { AbiEvent } from 'viem'
import TokenJson from '@/lib/abi/BondingCurveToken.json'
import { abstractSepolia } from '@/lib/wagmi'

type Trade = {
  ts: number
  side: 'buy' | 'sell'
  // choose your unit for volume – tokens is nice for bars
  volume: bigint
  tx: `0x${string}`
  blockNumber: bigint
}

const BUY_EVT = parseAbiItem('event Buy(address buyer,uint256 ethIn,uint256 tokensOut)') as AbiEvent
const SELL_EVT = parseAbiItem('event Sell(address seller,uint256 amountIn,uint256 ethOut)') as AbiEvent

export function useBuySellEvents(address: `0x${string}`) {
  const [trades, setTrades] = useState<Trade[]>([])
  const absRpc = process.env.NEXT_PUBLIC_ABSTRACT_RPC || 'https://api.testnet.abs.xyz'

  const pub = useMemo(
    () => createPublicClient({ chain: abstractSepolia, transport: http(absRpc) }),
    [absRpc]
  )

  useEffect(() => {
    let disposed = false
    if (!address) return

    ;(async () => {
      // 1) Backfill the recent window (e.g., last 3k blocks)
      const latest = await pub.getBlockNumber()
      const fromBlock = latest > 3000n ? latest - 3000n : 0n

      const logs = await pub.getLogs({
        address,
        fromBlock,
        toBlock: latest,
        events: [BUY_EVT, SELL_EVT],
      })

      const blocksSeen = new Map<bigint, number>()
      const blockTsCache = async (bn: bigint) => {
        const hit = blocksSeen.get(bn)
        if (hit) return hit
        const blk = await pub.getBlock({ blockNumber: bn })
        const ts = Number(blk.timestamp)
        blocksSeen.set(bn, ts)
        return ts
      }

      const initial = await Promise.all(
        logs.map(async (l) => {
          const isBuy = l.eventName === 'Buy'
          const ts = await blockTsCache(l.blockNumber!)
          const volume = isBuy ? (l.args as any).tokensOut as bigint
                               : (l.args as any).amountIn  as bigint
          return {
            ts,
            side: isBuy ? 'buy' : 'sell',
            volume,
            tx: l.transactionHash!,
            blockNumber: l.blockNumber!,
          } satisfies Trade
        })
      )

      if (!disposed) setTrades(initial)

      // 2) Live stream
      const unwatch = pub.watchContractEvent({
        address,
        abi: TokenJson.abi,
        eventName: ['Buy', 'Sell'],
        onLogs: async (ll) => {
          for (const l of ll) {
            const isBuy = l.eventName === 'Buy'
            const ts = await blockTsCache(l.blockNumber!)
            const volume = isBuy ? (l.args as any).tokensOut as bigint
                                 : (l.args as any).amountIn  as bigint
            if (!disposed) {
              setTrades((prev) => [
                ...prev,
                { ts, side: isBuy ? 'buy' : 'sell', volume, tx: l.transactionHash!, blockNumber: l.blockNumber! },
              ])
            }
          }
        },
      })

      return () => unwatch?.()
    })()

    return () => { disposed = true }
  }, [address, pub])

  return trades
}
