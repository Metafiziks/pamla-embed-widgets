'use client'
import { useState, useEffect } from 'react'

export default function Leaderboard() {
  const [rows, setRows] = useState<any[]>([])
  const [page, setPage] = useState(0)

  useEffect(() => {
    // For now we just fake data until hooked up to backend
    const fake = Array.from({ length: 100 }, (_, i) => ({
      rank: i + 1,
      addr: `0x${(Math.random() * 1e18).toString(16).slice(0, 6)}...`,
      txCount: Math.floor(Math.random() * 200),
    }))
    setRows(fake)
  }, [])

  const start = page * 25
  const end = start + 25
  const slice = rows.slice(start, end)

  return (
    <div style={{fontFamily:'ui-sans-serif,system-ui,Arial', color:'#f2f2f2', padding:20}}>
      <h2>Leaderboard — Top 100</h2>
      <table style={{width:'100%', borderCollapse:'collapse', marginTop:12}}>
        <thead>
          <tr>
            <th>Rank</th><th>Address</th><th>Tx Count</th>
          </tr>
        </thead>
        <tbody>
          {slice.map(r=>(
            <tr key={r.rank}>
              <td>{r.rank}</td>
              <td>{r.addr}</td>
              <td>{r.txCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{marginTop:12}}>
        {page>0 && <button onClick={()=>setPage(p=>p-1)}>Prev</button>}
        {(page+1)*25 < rows.length && <button onClick={()=>setPage(p=>p+1)}>Next</button>}
      </div>
    </div>
  )
}
