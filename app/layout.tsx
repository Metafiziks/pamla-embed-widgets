export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>PAMLA Widgets</title>
      </head>
      <body style={{ margin: 0, background: '#000' }}>
        {children}
      </body>
    </html>
  )
}
