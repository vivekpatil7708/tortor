import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant, getOwnerUser } from '@/lib/tenant'
import { createFulfillment } from '@/lib/fulfillments'
import { createFulfillmentSchema } from '@/lib/validators'
import { handleError, badRequest } from '@/lib/api-response'
import { zodMessage } from '@/lib/zod-error'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const body = createFulfillmentSchema.parse(await req.json())
    const owner = await getOwnerUser(session.id)

    const fulfillment = await createFulfillment({
      merchantId: session.id,
      orderId: params.id,
      actorUserId: owner?.id ?? null,
      fulfillmentType: body.fulfillment_type,
      items: body.items.map(i => ({ orderItemId: i.order_item_id, quantity: i.quantity })),
    })

    return NextResponse.json({ fulfillment })
  } catch (err) {
    const msg = zodMessage(err)
    if (msg) return badRequest(msg)
    return handleError(err)
  }
}