import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getMessageLogs } from '@/lib/messaging/logs'

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession()
    const sp = req.nextUrl.searchParams
    const logs = await getMessageLogs(session.id, {
      channel: sp.get('channel'),
      status: sp.get('status'),
      eventType: sp.get('eventType'),
      from: sp.get('from') ? new Date(sp.get('from')!) : null,
      to: sp.get('to') ? new Date(sp.get('to')!) : null,
      q: sp.get('q'),
      limit: sp.get('limit') ? Number(sp.get('limit')) : undefined,
      offset: sp.get('offset') ? Number(sp.get('offset')) : undefined,
    })
    return NextResponse.json(logs)
  } catch (err) {
    return handleError(err, 'Unauthorized')
  }
}