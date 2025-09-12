'use client'
import { Suspense } from 'react'
import LeaderboardClient from './LeaderboardClient'

export default function Page(){
  return (
    <Suspense fallback={<div style={{color:'#fff'}}>Loading…</div>}>
      <LeaderboardClient />
    </Suspense>
  )
}
