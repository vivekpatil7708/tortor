import { prisma } from '@/lib/prisma'
import { sendAutomatedEmail, buildEmailContextFromCheckout } from '@/lib/emails/service'
import { courierStatusStage, mapCourierStatusToPackageStatus } from './status-map'
import type { EmailAutomation } from '@prisma/client'

const MILESTONE_EMAIL_KEY: Record<string, EmailAutomation> = {
  shipped: 'shipment_created',
  in_transit: 'shipment_in_transit',
  out_for_delivery: 'shipment_out_for_delivery',
  delivered: 'shipment_delivered',
  delivery_failed: 'shipment_delivery_failed',
  returned: 'shipment_rto_initiated',
}

const EMAILABLE = new Set(Object.keys(MILESTONE_EMAIL_KEY))

function readMetadata(pkg: { providerMetadata?: unknown }): Record<string, unknown> {
  const raw = pkg.providerMetadata as Record<string, unknown> | null
  return raw && typeof raw === 'object' ? raw : {}
}

/**
 * Send the customer notification email for a package status milestone, at most
 * once per package. Tracks already-emailed milestones inside providerMetadata.
 */
export async function notifyShipmentMilestone(params: {
  merchantId: string
  packageId: string
  status: string
}): Promise<{ sent: boolean; key?: string; reason?: string }> {
  const { merchantId, packageId, status } = params
  const mapped = mapCourierStatusToPackageStatus(status)
  if (!EMAILABLE.has(mapped)) return { sent: false, reason: `No email for status '${mapped}'` }

  const pkg = await prisma.package.findFirst({
    where: { id: packageId, merchantId },
    include: {
      fulfillment: { include: { order: { include: { customer: true } }, items: { include: { orderItem: true } } } },
    },
  })
  if (!pkg) return { sent: false, reason: 'Package not found' }

  const metadata = readMetadata(pkg)
  const emailed = Array.isArray(metadata.emailed_milestones) ? (metadata.emailed_milestones as string[]) : []
  if (emailed.includes(mapped)) return { sent: false, reason: `Already emailed '${mapped}'` }

  const key = MILESTONE_EMAIL_KEY[mapped]
  const email = pkg.fulfillment.order.customer?.email
  if (!email) return { sent: false, reason: 'No customer email on order' }

  const order = pkg.fulfillment.order
  const items = pkg.fulfillment.items.map(fi => ({
    name: fi.orderItem?.productNameSnapshot ?? 'Item',
    quantity: fi.quantity,
    line_total: fi.orderItem?.lineTotal?.toNumber() ?? 0,
  }))

  const trackingNumber = pkg.trackingNumber || pkg.awbNumber || '-'
  const trackingUrl = pkg.trackingUrl || ''
  const estimated = pkg.estimatedDeliveryAt
    ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(pkg.estimatedDeliveryAt)
    : '—'

  const result = await sendAutomatedEmail({
    merchantId,
    key,
    to: email,
    context: buildEmailContextFromCheckout({
      orderNumber: order.orderNumber,
      amount: order.totalAmount.toNumber(),
      currency: order.currency,
      customerName: order.customer?.fullName ?? null,
      products: items,
      checkoutUrl: '',
      supportEmail: null,
      supportPhone: null,
      tracking: {
        tracking_number: trackingNumber,
        awb_number: pkg.awbNumber ?? '-',
        courier_name: pkg.courierProvider ?? '-',
        tracking_url: trackingUrl,
        estimated_delivery: estimated,
        event_location: '',
        return_tracking_number: pkg.returnTrackingNumber ?? '-',
      },
    }),
  })

  if (result) {
    await prisma.package.update({
      where: { id: packageId },
      data: { providerMetadata: { ...metadata, emailed_milestones: [...emailed, mapped] } as never },
    })
    return { sent: result.status === 'sent', key }
  }
  return { sent: false, key }
}

export { courierStatusStage }