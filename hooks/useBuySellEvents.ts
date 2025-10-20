'use client'

import { useEffect } from 'react'
import type { Abi } from 'viem'
import { publicClient } from '@/lib/viem'
import TokenJson from '@/lib/abi/BondingCurveToken.json'

type OnEvent = (args: {
  isBuy: boolean
  amount: bigint
  price?: bigint | null
  blockNumber: bigint
  txHash: `0x${string}`
}) => void

export default function useBuySellEvents(params: {
  address: `0x${string}`
  onEvent: OnEvent
}) {
  const { address, onEvent } = params
  const abi = (TokenJson.abi as Abi)

  useEffect(() => {
    if (!address) return

    // Watch "Buy"
    const unwatchBuy = publicClient.watchContractEvent({
      address,
      abi,
      eventName: 'Buy',
      onLogs: (logs) => {
        for (const l of logs as any[]) {
          onEvent({
            isBuy: true,
            amount: (l.args?.amount ?? l.args?.tokens ?? l.args?.value ?? 0n) as bigint,
            price:
              (l.args?.price as bigint | undefined) ??
              (l.args?.ethPerToken as bigint | undefined) ??
              null,
            blockNumber: l.blockNumber as bigint,
            txHash: l.transactionHash as `0x${string}`,
          })
        }
      },
    })

    // Watch "Sell"
    const unwatchSell = publicClient.watchContractEvent({
      address,
      abi,
      eventName: 'Sell',
      onLogs: (logs) => {
        for (const l of logs as any[]) {
          onEvent({
            isBuy: false,
            amount: (l.args?.amount ?? l.args?.tokens ?? l.args?.value ?? 0n) as bigint,
            price:
              (l.args?.price as bigint | undefined) ??
              (l.args?.ethPerToken as bigint | undefined) ??
              null,
            blockNumber: l.blockNumber as bigint,
            txHash: l.transactionHash as `0x${string}`,
          })
        }
      },
    })

    return () => {
      try { unwatchBuy?.() } catch {}
      try { unwatchSell?.() } catch {}
    }
  }, [address, onEvent])
}
