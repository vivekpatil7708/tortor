import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMerchant, getOwnerUser } from '@/lib/tenant'
import { addPackageTracking, addShipmentEvent, setPackageStatus } from '@/lib/fulfillments'
import { packageSchema, shipmentEventSchema, statusChangeSchema } from '@/lib/validators'
import { notFound, badRequest, handleError } from '@/lib/api-response'
import { zodMessage } from '@/lib/zod-error'

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireMerchant()
    const owner = await getOwnerUser(session.id)
    const body = await req.json()
    const type = body.type

    // PATCH /api/fulfillments/[id]/package — add tracking
    if (type === 'tracking') {
      const parsed = packageSchema.parse(body)
      const fulfillment = await prisma.fulfillment.findFirst({
        where: { id: params.id, merchantId: session.id },
        include: { packages: true },
      })
      if (!fulfillment) return notFound('Fulfillment not found')
      const pkg = resolvePackage(body, fulfillment.packages)
      if (!pkg) return notFound('No package on this fulfillment')
      if (fulfillment.fulfillmentType === 'shipping' || fulfillment.fulfillmentType === 'local_delivery') {
        const result = await addPackageTracking({
          merchantId: session.id,
          orderId: fulfillment.orderId,
          packageId: pkg.id,
          actorUserId: owner?.id ?? null,
          courierProvider: parsed.courier_provider ?? null,
          trackingNumber: parsed.tracking_number ?? null,
          trackingUrl: parsed.tracking_url || null,
          estimatedDeliveryAt: parsed.estimated_delivery_at ? new Date(parsed.estimated_delivery_at) : null,
          markShipped: parsed.mark_shipped,
        })
        return NextResponse.json({ result })
      }
      return badRequest('This fulfillment type does not support courier tracking')
    }

    // PATCH /api/fulfillments/[id]/package — package status change
    if (type === 'package_status') {
      const parsed = statusChangeSchema.parse(body)
      const fulfillment = await prisma.fulfillment.findFirst({
        where: { id: params.id, merchantId: session.id },
        include: { packages: true },
      })
      if (!fulfillment) return notFound('Fulfillment not found')
      const pkg = resolvePackage(body, fulfillment.packages)
      if (!pkg) return notFound('No package on this fulfillment')
      const result = await setPackageStatus({
        merchantId: session.id,
        orderId: fulfillment.orderId,
        packageId: pkg.id,
        actorUserId: owner?.id ?? null,
        nextStatus: parsed.status as never,
      })
      return NextResponse.json({ result })
    }

    return badRequest('Unsupported package action')
  } catch (err) {
    const msg = zodMessage(err)
    if (msg) return badRequest(msg)
    return handleError(err)
  }
}

export type PackageRow = { id: string; trackingNumber?: string | null; tracking_number?: string | null }

function resolvePackage(body: Record<string, unknown>, packages: PackageRow[]): PackageRow | undefined {
  const requested = body.package_id ?? body.packageId ?? body.tracking_number
  if (!requested) return (packages ?? [])[0]
  return (packages ?? []).find(p =>
    p.id === requested ||
    p.trackingNumber === requested ||
    (p as { tracking_number?: string | null }).tracking_number === requested
  ) ?? (packages ?? [])[0]
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireMerchant()
    const owner = await getOwnerUser(session.id)
    const rawBody = await req.json() as Record<string, unknown>
    const body = shipmentEventSchema.parse(rawBody)

    const fulfillment = await prisma.fulfillment.findFirst({
      where: { id: params.id, merchantId: session.id },
      include: { packages: true },
    })
    if (!fulfillment) return notFound('Fulfillment not found')
    const pkg = resolvePackage({ package_id: rawBody.package_id as string | undefined }, fulfillment.packages)
    if (!pkg) return notFound('No package on this fulfillment')

    const event = await addShipmentEvent({
      merchantId: session.id,
      orderId: fulfillment.orderId,
      packageId: pkg.id,
      actorUserId: owner?.id ?? null,
      eventLabel: body.event_label,
      eventStatus: body.event_status,
      location: body.location ?? null,
      eventAt: body.event_at ? new Date(body.event_at) : new Date(),
    })

    return NextResponse.json({ event })
  } catch (err) {
    const msg = zodMessage(err)
    if (msg) return badRequest(msg)
    return handleError(err)
  }
}