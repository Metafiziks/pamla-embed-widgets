'use client'
import { useEffect, useState } from 'react'

function parseAddresses(text: string): string[] {
  const parts = text.split(/\r?\n|,|\s+/).map(s=>s.trim()).filter(Boolean)
  const uniq = Array.from(new Set(parts))
  return uniq.filter(a => /^0x[a-fA-F0-9]{40}$/.test(a))
}

export default function AdminAllowlist() {
  const [raw, setRaw] = useState('')
  const [addresses, setAddresses] = useState<string[]>([])
  const [status, setStatus] = useState<string>('')
  const [acl, setAcl] = useState<string>('')

  useEffect(() => { setAddresses(parseAddresses(raw)) }, [raw])

  const submit = async (allow: boolean) => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(acl)) { alert('Enter a valid AccessController address'); return }
    if (addresses.length === 0) { alert('Paste at least one address'); return }
    setStatus('Submitting…')
    try {
      const res = await fetch('/api/admin/allowlist', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ acl, allow, addresses })
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Failed')
      setStatus(`Sent ${j.txCount} tx(s). First tx hash: ${j.firstHash}`)
    } catch (e:any) { setStatus(e?.message || 'Error') }
  }

  return (
    <div style={{maxWidth:800, margin:'40px auto', fontFamily:'ui-sans-serif,system-ui,Arial', color:'#f2f2f2'}}>
      <h1 style={{fontSize:22, fontWeight:800}}>Admin: Allowlist Uploader</h1>
      <p style={{opacity:.8}}>Paste wallet addresses (CSV or one per line). This calls <code>setAllowlistBatch</code> on your AccessController using a server-side key.</p>

      <label>AccessController address</label>
      <input value={acl} onChange={e=>setAcl(e.target.value)} placeholder="0x..." style={{width:'100%', padding:8, border:'1px solid #333', borderRadius:8, background:'#0f0f11', color:'#fff', marginTop:6, marginBottom:12}}/>

      <label>Addresses</label>
      <textarea value={raw} onChange={e=>setRaw(e.target.value)} rows={10} placeholder="0xabc..., 0xdef..., ..." style={{width:'100%', padding:8, border:'1px solid #333', borderRadius:8, background:'#0f0f11', color:'#fff', marginTop:6}}/>

      <div style={{display:'flex', gap:12, alignItems:'center', marginTop:12}}>
        <button onClick={()=>submit(true)} style={{padding:'8px 12px', border:'1px solid #333', background:'#111', color:'#fff', borderRadius:8}}>Allowlist ✓</button>
        <button onClick={()=>submit(false)} style={{padding:'8px 12px', border:'1px solid #333', background:'#111', color:'#fff', borderRadius:8}}>Remove ✕</button>
        <span style={{opacity:.8}}>{addresses.length} valid address(es)</span>
      </div>

      <div style={{marginTop:12, fontSize:12, opacity:.85}}>{status}</div>
    </div>
  )
}
