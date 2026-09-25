import { NextRequest, NextResponse } from 'next/server'
import { handleError, badRequest, notFound } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getReturn, transitionReturn, approveReturn, rejectReturn, scheduleReturnPickup, markReturnInTransit, markReturnReceived, closeReturn } from '@/lib/returns'

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const session = await requireSession()
    const ret = await getReturn(session.id, ctx.params.id)
    if (!ret) return notFound('Return not found')
    return NextResponse.json({ return: ret })
  } catch (err) {
    return handleError(err)
  }
}

const ACTIONS: Record<string, (p: { merchantId: string; returnId: string; note?: string | null; actorUserId?: string | null }) => Promise<unknown>> = {
  approve: approveReturn,
  reject: rejectReturn,
  schedule_pickup: scheduleReturnPickup,
  mark_transit: markReturnInTransit,
  mark_received: markReturnReceived,
  close: closeReturn,
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const session = await requireSession()
    const body = await req.json()
    const { id } = ctx.params

    if (body.to) {
      const updated = await transitionReturn({ merchantId: session.id, returnId: id, to: body.to, note: body.note ?? body.reason ?? null, actorUserId: session.id })
      return NextResponse.json({ return: updated })
    }

    const action = ACTIONS[String(body.action ?? '')]
    if (!action) return badRequest('Provide a valid action or a target status (to)')
    await action({ merchantId: session.id, returnId: id, note: body.note ?? null, actorUserId: session.id })
    const updated = await getReturn(session.id, id)
    return NextResponse.json({ return: updated })
  } catch (err) {
    return handleError(err)
  }
}