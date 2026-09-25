import { NextRequest, NextResponse } from 'next/server'
import { handleError, badRequest } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { createReturnRequest } from '@/lib/returns'

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession()
    const sp = req.nextUrl.searchParams
    const status = sp.get('status')
    const from = sp.get('from') ? new Date(sp.get('from')!) : null
    const to = sp.get('to') ? new Date(sp.get('to')!) : null
    const { returns, total, limit } = await import('@/lib/returns').then(m =>
      m.listReturns(session.id, {
        status,
        from,
        to,
        q: sp.get('q'),
        limit: sp.get('limit') ? Number(sp.get('limit')) : undefined,
        offset: sp.get('offset') ? Number(sp.get('offset')) : undefined,
      }),
    )
    return NextResponse.json({ returns, total, limit })
  } catch (err) {
    return handleError(err, 'Unauthorized')
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    const body = await req.json()
    if (!body.orderId) return badRequest('orderId is required')
    if (!Array.isArray(body.items) || !body.items.length) return badRequest('At least one return item is required')

    const ret = await createReturnRequest({
      merchantId: session.id,
      orderId: body.orderId,
      customerId: body.customerId ?? undefined,
      reason: body.reason ?? undefined,
      customerComment: body.customerComment ?? undefined,
      items: body.items,
      actorUserId: session.id,
    })
    return NextResponse.json({ return: ret }, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}