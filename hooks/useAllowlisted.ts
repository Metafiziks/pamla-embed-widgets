'use client'

import { useAccount, useReadContract } from 'wagmi'
import type { Abi } from 'viem'
import { ACLABI } from '@/lib/abi'
import { ADDRESSES } from '@/lib/addresses'

/** Checks allowlist status for the connected wallet. */
export function useAllowlisted() {
  const { address } = useAccount()

  // Try common names: isAllowlisted / isAllowlist / allowlist(address)->bool
  const r1 = useReadContract({
    address: ADDRESSES.ACL as `0x${string}`,
    abi: ACLABI as Abi,
    functionName: 'isAllowlisted',
    args: address ? [address] : undefined,
    query: { enabled: !!address, retry: 0 },
  })

  const r2 = useReadContract({
    address: ADDRESSES.ACL as `0x${string}`,
    abi: ACLABI as Abi,
    functionName: 'isAllowlist', // if your ABI uses this spelling
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!r1.error, retry: 0 },
  })

  const r3 = useReadContract({
    address: ADDRESSES.ACL as `0x${string}`,
    abi: ACLABI as Abi,
    functionName: 'allowlist',   // mapping(address=>bool) getter
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!r1.error && !!r2.error, retry: 0 },
  })

  const data = (r1.data ?? r2.data ?? r3.data) as boolean | undefined
  const isLoading = r1.isLoading || r2.isLoading || r3.isLoading
  const error = r1.error && r2.error && r3.error ? (r1.error || r2.error || r3.error) : undefined

  return { address, isAllowlisted: !!data, isLoading, error }
}
