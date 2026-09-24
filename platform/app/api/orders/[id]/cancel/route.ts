import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant, getOwnerUser } from '@/lib/tenant'
import { cancelOrder } from '@/lib/fulfillments'
import { statusChangeSchema } from '@/lib/validators'
import { badRequest, handleError } from '@/lib/api-response'
import { zodMessage } from '@/lib/zod-error'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const owner = await getOwnerUser(session.id)
    const body = await req.json()

    const parsed = statusChangeSchema.partial().parse({
      reason: body.reason ?? null,
    })

    const result = await cancelOrder({
      merchantId: session.id,
      orderId: params.id,
      actorUserId: owner?.id ?? null,
      reason: parsed.reason ?? null,
    })

    return NextResponse.json({ success: true, result })
  } catch (err) {
    const msg = zodMessage(err)
    if (msg) return badRequest(msg)
    return handleError(err)
  }
}