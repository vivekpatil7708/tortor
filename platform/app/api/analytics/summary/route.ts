import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { handleError } from '@/lib/api-response'
import { analyticsSummary } from '@/lib/analytics-summary'

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession()
    const { searchParams } = new URL(req.url)
    const summary = await analyticsSummary(session.id, searchParams.get('from'), searchParams.get('to'))
    if (!summary) return NextResponse.json({ error: 'Dates must look like 2026-10-06' }, { status: 400 })
    return NextResponse.json(summary)
  } catch (err) {
    return handleError(err, 'Could not load the summary')
  }
}
