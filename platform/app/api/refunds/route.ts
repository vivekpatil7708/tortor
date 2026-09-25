import { NextRequest, NextResponse } from 'next/server'
import { handleError, badRequest } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { createRefund, listRefunds } from '@/lib/refunds'

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession()
    const sp = req.nextUrl.searchParams
    const { refunds, total, limit } = await listRefunds(session.id, {
      status: sp.get('status'),
      from: sp.get('from') ? new Date(sp.get('from')!) : null,
      to: sp.get('to') ? new Date(sp.get('to')!) : null,
      limit: sp.get('limit') ? Number(sp.get('limit')) : undefined,
      offset: sp.get('offset') ? Number(sp.get('offset')) : undefined,
    })
    return NextResponse.json({ refunds, total, limit })
  } catch (err) {
    return handleError(err, 'Unauthorized')
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    const body = await req.json()
    if (!body.orderId || !body.paymentId || !body.amount) return badRequest('orderId, paymentId and amount are required')

    const refund = await createRefund({
      merchantId: session.id,
      orderId: body.orderId,
      paymentId: body.paymentId,
      returnId: body.returnId ?? null,
      amount: Number(body.amount),
      reason: body.reason ?? null,
      actorUserId: session.id,
    })
    return NextResponse.json({ refund }, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}