import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMerchant, getOwnerUser } from '@/lib/tenant'
import { serializeOrder } from '@/lib/serializers'
import { statusChangeSchema, notesSchema } from '@/lib/validators'
import { setOrderStatus, setPaymentStatus, updateOrderNotes } from '@/lib/orders'
import { notFound, badRequest, handleError } from '@/lib/api-response'
import { zodMessage } from '@/lib/zod-error'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const order = await prisma.order.findFirst({
      where: { id: params.id, merchantId: session.id },
      include: {
        customer: { include: { addresses: true } },
        orderItems: true,
        fulfillments: {
          include: {
            items: { include: { orderItem: true } },
            packages: { include: { events: { orderBy: { eventAt: 'asc' } } } },
          },
        },
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    })
    if (!order) return notFound('Order not found')

    return NextResponse.json({ order: serializeOrder(order) })
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const owner = await getOwnerUser(session.id)
    const body = await req.json()
    const type = body.type

    if (type === 'status') {
      const parsed = statusChangeSchema.parse(body)
      const updated = await setOrderStatus({
        merchantId: session.id,
        orderId: params.id,
        actorUserId: owner?.id ?? null,
        nextStatus: parsed.status as never,
        reason: parsed.reason ?? null,
      })
      return NextResponse.json({ order: serializeOrder(updated) })
    }

    if (type === 'payment_status') {
      const parsed = statusChangeSchema.parse(body)
      const updated = await setPaymentStatus({
        merchantId: session.id,
        orderId: params.id,
        actorUserId: owner?.id ?? null,
        nextStatus: parsed.status as never,
        reason: parsed.reason ?? null,
      })
      return NextResponse.json({ order: serializeOrder(updated) })
    }

    if (type === 'notes') {
      const parsed = notesSchema.parse(body)
      const updated = await updateOrderNotes({
        merchantId: session.id,
        orderId: params.id,
        actorUserId: owner?.id ?? null,
        internalNotes: parsed.internal_notes ?? null,
      })
      return NextResponse.json({ order: serializeOrder(updated) })
    }

    return badRequest('Unsupported update type')
  } catch (err) {
    const msg = zodMessage(err)
    if (msg) return badRequest(msg)
    return handleError(err)
  }
}