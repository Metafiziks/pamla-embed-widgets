// app/admin-allowlist/layout.tsx
export const dynamic = 'force-dynamic'   // do not pre-render
export const revalidate = 0              // no ISR
export const fetchCache = 'force-no-store'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
