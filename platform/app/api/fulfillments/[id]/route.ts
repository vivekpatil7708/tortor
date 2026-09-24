import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMerchant, getOwnerUser } from '@/lib/tenant'
import { updateFulfillmentStatus } from '@/lib/fulfillments'
import { statusChangeSchema } from '@/lib/validators'
import { serializeFulfillment } from '@/lib/serializers'
import { notFound, badRequest, handleError } from '@/lib/api-response'
import { zodMessage } from '@/lib/zod-error'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const fulfillment = await prisma.fulfillment.findFirst({
      where: { id: params.id, merchantId: session.id },
      include: {
        items: { include: { orderItem: true } },
        packages: { include: { events: { orderBy: { eventAt: 'asc' } } } },
        order: true,
      },
    })
    if (!fulfillment) return notFound('Fulfillment not found')
    return NextResponse.json({ fulfillment })
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const owner = await getOwnerUser(session.id)
    const body = statusChangeSchema.parse(await req.json())

    const fulfillment = await prisma.fulfillment.findFirst({
      where: { id: params.id, merchantId: session.id },
      select: { orderId: true },
    })
    if (!fulfillment) return notFound('Fulfillment not found')

    const result = await updateFulfillmentStatus({
      merchantId: session.id,
      orderId: fulfillment.orderId,
      fulfillmentId: params.id,
      actorUserId: owner?.id ?? null,
      nextStatus: body.status as never,
      reason: body.reason ?? null,
    })

    return NextResponse.json({
      fulfillment: serializeFulfillment(result.fulfillment),
      summary: result.summary,
    })
  } catch (err) {
    const msg = zodMessage(err)
    if (msg) return badRequest(msg)
    return handleError(err)
  }
}