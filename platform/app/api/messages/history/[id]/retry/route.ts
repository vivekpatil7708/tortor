import { NextResponse } from 'next/server'
import { handleError, badRequest } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { retryFailedMessage } from '@/lib/messaging/logs'
import { dispatchLog } from '@/lib/messaging/engine'

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  try {
    const session = await requireSession()
    const { id } = ctx.params
    const started = await retryFailedMessage(id, session.id)
    if (!started.ok || !started.log) return badRequest(started.error ?? 'Message cannot be retried')
    const result = await dispatchLog(session.id, started.log.id)
    return NextResponse.json({ log: started.log, result })
  } catch (err) {
    return handleError(err)
  }
}