// app/api/leaderboard/upload/route.ts
import { NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const OUT_DIR = process.env.OUT_DIR ?? '/opt/render/data/leaderboard'
const FILE = 'participants_volume.json'
const SECRET = process.env.LEADERBOARD_SECRET

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const secret = req.headers.get('x-cron-secret') || ''
    if (!SECRET || secret !== SECRET) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await req.text()
    // basic sanity
    JSON.parse(body)

    await fs.mkdir(OUT_DIR, { recursive: true })
    const fp = path.join(OUT_DIR, FILE)
    await fs.writeFile(fp, body, 'utf8')

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'write failed' }, { status: 500 })
  }
}
