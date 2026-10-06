import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant, getOwnerUser } from '@/lib/tenant'
import { createProviderShipmentSchema } from '@/lib/validators'
import { createProviderShipment } from '@/lib/couriers/shipments'
import { serializeFulfillment, serializePackage } from '@/lib/serializers'
import { badRequest, handleError, intentionalErrorMessage } from '@/lib/api-response'
import { zodMessage } from '@/lib/zod-error'

// POST /api/orders/[id]/shipments
// Create a provider-backed shipment (idempotent on request_id).
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireMerchant()
    const owner = await getOwnerUser(session.id)
    const body = createProviderShipmentSchema.parse(await req.json())

    const result = await createProviderShipment({
      merchantId: session.id,
      orderId: params.id,
      actorUserId: owner?.id ?? null,
      fulfillmentType: body.fulfillment_type,
      items: body.items.map(i => ({ orderItemId: i.order_item_id, quantity: i.quantity })),
      courierProvider: body.courier_provider ?? null,
      courierPreference: body.courier_preference ?? null,
      weightKg: body.weight_kg ?? undefined,
      lengthCm: body.length_cm ?? undefined,
      breadthCm: body.breadth_cm ?? undefined,
      heightCm: body.height_cm ?? undefined,
      paymentMode: body.payment_mode,
      pickupScheduledAt: body.pickup_scheduled_at ? new Date(body.pickup_scheduled_at) : null,
      requestId: body.request_id ?? undefined,
    })

    return NextResponse.json({
      fulfillment: serializeFulfillment(result.fulfillment),
      package: serializePackage(result.package),
      idempotent: result.idempotent ?? false,
      summary: result.summary,
    })
  } catch (err) {
    const msg = zodMessage(err)
    if (msg) return badRequest(msg)
    const custom = intentionalErrorMessage(err)
    if (custom === 'Unauthorized') return handleError(err)
    if (custom) return badRequest(custom)
    return handleError(err)
  }
}