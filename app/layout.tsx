// app/admin-allowlist/layout.tsx
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body style={{ margin: 0, background: '#000' }}>
        {children}
      </body>
    </html>
  )
}
