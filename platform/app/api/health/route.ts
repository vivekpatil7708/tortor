import { NextResponse } from 'next/server'
import { runHealthChecks } from '@/lib/health'

export const dynamic = 'force-dynamic'

// Reuse a result for a few seconds so repeated calls can't load the database.
const CACHE_MS = 15_000
let cached: { at: number; ok: boolean; failing: string[] } | null = null

/**
 * Public ok/fail check that the database matches the code (see lib/health.ts).
 * Called after every release and by the GitHub schedule, which emails the
 * owner when it fails. Answers only ok or the failing table names.
 */
export async function GET() {
  if (!cached || Date.now() - cached.at > CACHE_MS) {
    cached = { at: Date.now(), ...(await runHealthChecks()) }
  }
  return NextResponse.json(cached.ok ? { ok: true } : { ok: false, failing: cached.failing }, {
    status: cached.ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
