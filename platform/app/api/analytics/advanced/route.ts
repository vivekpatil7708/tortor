import { NextRequest, NextResponse } from 'next/server'
import { handleError, badRequest } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { runOrderAnalytics } from '@/lib/analytics/engine'

const GROUP_BY: string[] = ['day', 'week', 'month']
const STATUS: string[] = ['all', 'paid', 'pending', 'refunded', 'cancelled']

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession()
    const sp = req.nextUrl.searchParams
    const groupBy = sp.get('groupBy') ?? 'day'
    const status = sp.get('status') ?? 'all'
    if (!GROUP_BY.includes(groupBy)) return badRequest('Invalid groupBy')
    if (!STATUS.includes(status)) return badRequest('Invalid status')

    const from = sp.get('from') ? new Date(sp.get('from')!) : undefined
    const to = sp.get('to') ? new Date(sp.get('to')!) : undefined
    const channel = sp.get('channel') ?? undefined

    const result = await runOrderAnalytics({
      merchantId: session.id,
      groupBy: groupBy as 'day' | 'week' | 'month',
      status: status as 'all' | 'paid' | 'pending' | 'refunded' | 'cancelled',
      from,
      to,
      channel: channel || undefined,
    })
    return NextResponse.json(result)
  } catch (err) {
    return handleError(err, 'Unauthorized')
  }
}