import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant, getOwnerUser } from '@/lib/tenant'
import { courierPackageActionSchema } from '@/lib/validators'
import { generateLabelForPackage, schedulePickupForPackage, cancelProviderPackage, initiateReturnForPackage, syncPackageFromProvider } from '@/lib/couriers/shipments'
import { serializePackage } from '@/lib/serializers'
import { prisma } from '@/lib/prisma'
import { badRequest, notFound, handleError } from '@/lib/api-response'
import { zodMessage } from '@/lib/zod-error'

// PATCH /api/courier/packages/[id] — courier package actions
// body: { action: 'label' | 'pickup' | 'cancel' | 'return' | 'sync', pickup_date?, reason? }
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireMerchant()
    const owner = await getOwnerUser(session.id)
    const body = courierPackageActionSchema.parse(await req.json())

    const pkg = await prisma.package.findFirst({ where: { id: params.id, merchantId: session.id } })
    if (!pkg) return notFound('Package not found')

    let result: unknown
    switch (body.action) {
      case 'label': {
        const label = await generateLabelForPackage({ merchantId: session.id, packageId: params.id, actorUserId: owner?.id ?? null })
        result = { label_url: label.labelUrl, content_type: label.contentType }
        break
      }
      case 'pickup': {
        if (!body.pickup_date) return badRequest('pickup_date is required for pickup scheduling')
        const pickup = await schedulePickupForPackage({ merchantId: session.id, packageId: params.id, pickupDate: new Date(body.pickup_date), actorUserId: owner?.id ?? null })
        result = { pickup_scheduled_at: pickup.pickupScheduledAt.toISOString() }
        break
      }
      case 'cancel': {
        const cancelled = await cancelProviderPackage({ merchantId: session.id, packageId: params.id, actorUserId: owner?.id ?? null })
        result = cancelled
        break
      }
      case 'return': {
        const returned = await initiateReturnForPackage({ merchantId: session.id, packageId: params.id, actorUserId: owner?.id ?? null, reason: body.reason ?? null })
        result = returned
        break
      }
      case 'sync': {
        result = await syncPackageFromProvider({ merchantId: session.id, packageId: params.id })
        break
      }
      default:
        return badRequest('Unsupported action')
    }

    const fresh = await prisma.package.findFirst({
      where: { id: params.id, merchantId: session.id },
      include: { events: { orderBy: { eventAt: 'asc' } } },
    })
    return NextResponse.json({ ok: true, action: body.action, result, package: fresh ? serializePackage(fresh) : null })
  } catch (err) {
    const msg = zodMessage(err)
    if (msg) return badRequest(msg)
    const custom = err instanceof Error ? err.message : null
    if (custom === 'Unauthorized') return handleError(err)
    if (custom && !custom.startsWith('Mock')) return badRequest(custom)
    return handleError(err)
  }
}