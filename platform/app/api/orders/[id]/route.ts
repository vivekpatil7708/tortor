import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { notFound, handleError } from '@/lib/api-response'
import { serializeOrder } from '@/lib/serializers'

/** One order, with its items, customer, fulfilments and status history. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireMerchant()
    const { id } = await ctx.params

    const order = await prisma.order.findFirst({
      where: { id, merchantId: session.id },
      include: {
        customer: true,
        orderItems: true,
        fulfillments: { include: { items: true, packages: true } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    })
    if (!order) return notFound('Order not found')

    return NextResponse.json({ order: serializeOrder(order) })
  } catch (err) {
    return handleError(err, 'Could not load this order')
  }
}
