import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

/**
 * Where your cron writes the file:
 *   /data/leaderboard/participants_volume.json
 * You can override OUT_DIR in env if you like.
 */
const OUT_DIR = process.env.OUT_DIR ?? '/data/leaderboard'
const FILE = 'participants_volume.json'
const FILEPATH = path.join(OUT_DIR, FILE)

// Tell Next not to cache this at build-time
export const dynamic = 'force-dynamic'

// Optional: you can also export a revalidate window if you prefer ISR style
// export const revalidate = 0

/** HEAD: lightweight freshness check with ETag */
export async function HEAD(req: Request) {
  try {
    const stat = await fs.stat(FILEPATH)
    const etag = `"${stat.size}-${Math.floor(stat.mtimeMs)}"`

    // If client sent If-None-Match and it matches, return 304
    const ifNoneMatch = req.headers.get('if-none-match')
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new NextResponse(null, { status: 304 })
    }

    return new NextResponse(null, {
      status: 200,
      headers: {
        ETag: etag,
        'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60',
        'Content-Type': 'application/json; charset=utf-8',
      },
    })
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return new NextResponse(null, { status: 404 })
    }
    return new NextResponse(null, { status: 500 })
  }
}

/** GET: returns the leaderboard JSON as-is */
export async function GET(req: Request) {
  try {
    const [raw, stat] = await Promise.all([fs.readFile(FILEPATH, 'utf8'), fs.stat(FILEPATH)])
    const etag = `"${stat.size}-${Math.floor(stat.mtimeMs)}"`

    // If client sent If-None-Match and it matches, return 304
    const ifNoneMatch = req.headers.get('if-none-match')
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new NextResponse(null, { status: 304 })
    }

    // Validate JSON minimally (optional)
    // If your file is guaranteed valid, you can skip parsing and stream raw.
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      // Bad/partial write race: serve 503 so client retries
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
    if (err?.code === 'ENOENT') {
      return NextResponse.json({ error: 'Leaderboard not generated yet' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
