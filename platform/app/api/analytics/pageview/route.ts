import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { clientIp } from '@/lib/rate-limit'

const MAX_PATH_LENGTH = 200
const MAX_VIEWS_PER_MINUTE = 30

// Per-server-instance counter: a cheap brake on one client flooding page_views.
// A hard limit needs a platform rule (for example a Vercel Firewall rate limit).
const recentViews = new Map<string, { count: number; windowStart: number }>()

function allowView(ip: string | null): boolean {
  if (!ip) return true
  const now = Date.now()
  const entry = recentViews.get(ip)
  if (!entry || now - entry.windowStart > 60_000) {
    if (recentViews.size > 10_000) recentViews.clear()
    recentViews.set(ip, { count: 1, windowStart: now })
    return true
  }
  entry.count += 1
  return entry.count <= MAX_VIEWS_PER_MINUTE
}

export async function POST(req: NextRequest) {
  try {
    const { path } = await req.json()

    if (typeof path !== 'string' || !path.startsWith('/') || path.length > MAX_PATH_LENGTH) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    const ipAddress = clientIp(req)
    if (!allowView(ipAddress)) {
      return NextResponse.json({ ok: false }, { status: 429 })
    }

    // Only the path is stored: no query string and no Referer, which used to
    // record full page URLs, password-reset tokens included.
    await prisma.pageView.create({
      data: { path: path.split(/[?#]/)[0], ipAddress },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
