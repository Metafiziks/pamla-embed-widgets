// app/embed/page.tsx
import { Suspense } from 'react'
import EmbedClient from './EmbedClient'

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <Suspense fallback={<div style={{color:'#fff'}}>Loading…</div>}>
      <EmbedClient />
    </Suspense>
  )
}
