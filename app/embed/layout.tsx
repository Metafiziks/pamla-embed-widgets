// app/embed/layout.tsx
import type { Metadata } from 'next'
import { Providers } from '../lib/wagmi'

export const metadata: Metadata = {
  title: 'PAMLA Embed',
  description: 'Trading widget + chart',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </head>
      <body style={{ margin: 0, background: 'transparent' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
