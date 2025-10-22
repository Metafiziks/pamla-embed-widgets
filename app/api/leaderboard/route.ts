// app/api/leaderboard/route.ts
import { NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'

// Where the cron writes the file on Render Disk.
const OUT_DIR = process.env.OUT_DIR ?? '/opt/render/data/leaderboard'
const FILE = 'participants_volume.json'
const FILEPATH = path.join(OUT_DIR, FILE)

export const dynamic = 'force-dynamic'

export async function HEAD(req: Request) {
  try {
    const stat = await fs.stat(FILEPATH)
    const etag = `"${stat.size}-${Math.floor(stat.mtimeMs)}"`
    const ifNoneMatch = req.headers.get('if-none-match')
    if (ifNoneMatch && ifNoneMatch === etag) return new NextResponse(null, { status: 304 })

    return new NextResponse(null, {
      status: 200,
      headers: {
        ETag: etag,
        'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60',
        'Content-Type': 'application/json; charset=utf-8',
      },
    })
  } catch (err: any) {
    if (err?.code === 'ENOENT') return new NextResponse(null, { status: 404 })
    return new NextResponse(null, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const [raw, stat] = await Promise.all([fs.readFile(FILEPATH, 'utf8'), fs.stat(FILEPATH)])
    const etag = `"${stat.size}-${Math.floor(stat.mtimeMs)}"`
    const ifNoneMatch = req.headers.get('if-none-match')
    if (ifNoneMatch && ifNoneMatch === etag) return new NextResponse(null, { status: 304 })

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: 'File not ready' }, { status: 503 })
    }

    return NextResponse.json(parsed, {
      status: 200,
      headers: {
        ETag: etag,
        'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60',
      },
    })
  } catch (err: any) {
    if (err?.code === 'ENOENT') return NextResponse.json({ error: 'Leaderboard not generated yet' }, { status: 404 })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
