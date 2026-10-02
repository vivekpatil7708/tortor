import { nanoid } from 'nanoid'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { canTransitionFulfillment, generateFulfillmentNumber } from '@/lib/status'
import { recalculateOrderFulfillmentSummary } from '@/lib/fulfillment-summary'
import { dispatchMerchantWebhook } from '@/lib/webhook-delivery'
import { getShipmentProviderForMerchant, getProviderByName } from './connections'
import { getCourierProvider } from './index'
import { applyCourierTrackingUpdate } from './apply-tracking'
import { notifyShipmentMilestone } from './notify'
import type { CourierAddress, CourierProvider } from './provider'
import type { FulfillmentType as FT, KeyMode, Prisma } from '@prisma/client'

export interface ProviderShipmentItemInput {
  orderItemId: string
  quantity: number
}

export interface CreateProviderShipmentParams {
  merchantId: string
  orderId: string
  actorUserId?: string | null
  fulfillmentType?: FT
  items: ProviderShipmentItemInput[]
  /** Explicit provider identity ('mock', 'shiprocket', ...). Defaults to the merchant's enabled provider. */
  courierProvider?: string | null
  courierPreference?: string | null
  weightKg?: number
  lengthCm?: number
  breadthCm?: number
  heightCm?: number
  paymentMode?: 'PREPAID' | 'COD'
  pickupScheduledAt?: Date | null
  /** Idempotency key — the same request id never creates two shipments. */
  requestId?: string
}

function toKeyMode(testMode: boolean): KeyMode {
  return testMode ? 'test' : 'live'
}

/**
 * Create a provider-backed shipment for an order: validates quantities, calls
 * the courier (mock or live), then persists fulfillment + package + timeline in
 * a transaction. Idempotent on `requestId` — repeated calls return the existing
 * shipment instead of creating a duplicate.
 */
export async function createProviderShipment(params: CreateProviderShipmentParams): Promise<any> {
  const {
    merchantId,
    orderId,
    actorUserId = null,
    fulfillmentType = 'shipping',
    items,
    courierProvider: explicitProvider,
    courierPreference = null,
    requestId = `req_${nanoid(16)}`,
  } = params

  if (!items.length) throw new Error('Select at least one item')

  // ---- idempotency ----------------------------------------------------------
  const existingIdempotent = await prisma.package.findFirst({
    where: {
      merchantId,
      fulfillment: { orderId, fulfillmentType: { in: ['shipping', 'local_delivery'] } },
      providerMetadata: { path: ['request_id'], equals: requestId },
    },
    include: { fulfillment: true },
  })
  if (existingIdempotent) {
    return { fulfillment: existingIdempotent.fulfillment, package: existingIdempotent, idempotent: true }
  }

  // ---- resolve provider -------------------------------------------------------
  let provider: CourierProvider
  let providerName: string
  let testMode = true
  if (explicitProvider && explicitProvider !== 'auto') {
    const resolved = await getProviderByName(merchantId, explicitProvider)
    if (resolved.error) throw new Error(resolved.error)
    provider = resolved.provider
    providerName = resolved.providerName
    testMode = resolved.testMode
  } else {
    const resolved = await getShipmentProviderForMerchant(merchantId)
    provider = resolved.provider
    providerName = resolved.providerName
    testMode = resolved.testMode || true
  }

  // ---- validate order + quantities ------------------------------------------
  const order = await prisma.order.findFirst({
    where: { id: orderId, merchantId },
    include: { orderItems: true, customer: true },
  })
  if (!order) throw new Error('Order not found')
  if (order.orderStatus === 'cancelled') throw new Error('Cannot fulfill a cancelled order')
  if (order.orderStatus === 'completed') throw new Error('Cannot fulfill a completed order')

  const used = new Map<string, number>()
  const existingFulfillments = await prisma.fulfillment.findMany({
    where: { orderId, status: { not: 'cancelled' } },
    include: { items: true },
  })
  for (const f of existingFulfillments) {
    for (const fi of f.items) used.set(fi.orderItemId, (used.get(fi.orderItemId) ?? 0) + fi.quantity)
  }

  const orderItemById = new Map(order.orderItems.map(i => [i.id, i]))
  for (const input of items) {
    if (!orderItemById.has(input.orderItemId)) throw new Error('Item does not belong to this order')
    if (input.quantity < 1) throw new Error('Quantity must be at least 1')
    const item = orderItemById.get(input.orderItemId)!
    const remaining = item.quantityOrdered - item.quantityCancelled - (used.get(input.orderItemId) ?? 0)
    if (input.quantity > remaining) {
      throw new Error(`Cannot fulfill more than the remaining quantity for an item (remaining: ${remaining})`)
    }
  }

  // ---- courier call (external) ----------------------------------------------
  const shippingAddress = (order.shippingAddressSnapshot ?? {}) as Record<string, unknown>
  const recipient: CourierAddress = {
    name: String(shippingAddress.recipient_name || order.customer?.fullName || 'Customer'),
    phone: String(shippingAddress.phone || order.customer?.phone || ''),
    email: order.customer?.email ?? null,
    address1: String(shippingAddress.line1 || shippingAddress.address1 || '-'),
    address2: shippingAddress.line2 ? String(shippingAddress.line2) : null,
    city: String(shippingAddress.city || '-'),
    state: String(shippingAddress.state || '-'),
    pincode: String(shippingAddress.pincode || '-'),
    country: String(shippingAddress.country || 'India'),
  }

  // Distinct requested order items for the courier line items.
  const orderItemMap = new Map(order.orderItems.map(i => [i.id, i]))
  const courierItems = items.map(input => {
    const oi = orderItemMap.get(input.orderItemId)!
    return { name: oi.productNameSnapshot, sku: oi.skuSnapshot, quantity: input.quantity, price: oi.unitPrice.toNumber() }
  })

  const created = await provider.createShipment({
    merchantId,
    orderId,
    orderNumber: order.orderNumber,
    requestId,
    recipient,
    items: courierItems,
    paymentMode: params.paymentMode ?? (order.paymentStatus === 'pending' ? 'COD' : 'PREPAID'),
    weightKg: params.weightKg,
    lengthCm: params.lengthCm,
    breadthCm: params.breadthCm,
    heightCm: params.heightCm,
    courierPreference,
    collectOnDelivery: order.paymentStatus === 'pending' ? order.totalAmount.toNumber() : null,
    pickupScheduledAt: params.pickupScheduledAt ?? null,
  })

  const now = new Date()
  const summary = await prisma.$transaction(async (tx) => {
    const fulfillment = await tx.fulfillment.create({
      data: {
        merchantId,
        orderId,
        fulfillmentType,
        status: 'shipped',
        shippedAt: now,
        fulfillmentNumber: await generateUniqueFulfillmentNumber(tx, merchantId),
      },
    })

    for (const input of items) {
      await tx.fulfillmentItem.create({
        data: { fulfillmentId: fulfillment.id, orderItemId: input.orderItemId, quantity: input.quantity },
      })
      const prev = used.get(input.orderItemId) ?? 0
      await tx.orderItem.update({
        where: { id: input.orderItemId },
        data: { quantityFulfilled: prev + input.quantity },
      })
    }

    const pkg = await tx.package.create({
      data: {
        merchantId,
        fulfillmentId: fulfillment.id,
        courierProvider: created.courierName || providerName,
        trackingNumber: created.awbNumber || null,
        trackingUrl: created.trackingUrl ?? null,
        packageStatus: 'shipped',
        shippedAt: now,
        estimatedDeliveryAt: created.estimatedDeliveryAt ?? null,
        pickupScheduledAt: created.pickupScheduledAt ?? null,
        provider: providerName,
        providerShipmentId: created.providerShipmentId || null,
        awbNumber: created.awbNumber || null,
        labelUrl: created.labelUrl ?? null,
        providerMetadata: {
          request_id: requestId,
          order_number: order.orderNumber,
          courier_name: created.courierName,
          payment_mode: order.paymentStatus === 'pending' ? 'COD' : 'PREPAID',
          ...(created.providerMetadata ?? {}),
        } as never,
      },
    })

    await tx.shipmentEvent.create({
      data: {
        merchantId,
        packageId: pkg.id,
        eventLabel: 'Shipment created',
        eventStatus: 'shipped',
        location: recipient.city,
        eventAt: now,
        source: 'courier',
      },
    })

    await tx.orderStatusHistory.create({
      data: {
        merchantId,
        orderId,
        fulfillmentId: fulfillment.id,
        packageId: pkg.id,
        previousStatus: 'unfulfilled',
        newStatus: 'shipped',
        statusType: 'fulfillment',
        changedByUserId: actorUserId,
        changedByType: 'merchant',
        changeReason: `Shipment created via ${providerName}`,
      },
    })

    await logAudit({
      merchantId,
      actorUserId,
      action: 'provider_shipment_created',
      entityType: 'package',
      entityId: pkg.id,
      metadata: {
        provider: providerName,
        awb: created.awbNumber,
        shipment_id: created.providerShipmentId,
        request_id: requestId,
        order_number: order.orderNumber,
      },
    })

    const sum = await recalculateOrderFulfillmentSummary(orderId, tx)
    return { fulfillment, package: pkg, summary: sum }
  })

  // ---- side effects ----------------------------------------------------------
  await notifyShipmentMilestone({ merchantId, packageId: summary.package.id, status: 'shipped' }).catch(() => null)

  const data = {
    order_id: order.id,
    order_number: order.orderNumber,
    fulfillment_id: summary.fulfillment.id,
    package_id: summary.package.id,
    provider: providerName,
    awb_number: created.awbNumber || null,
    tracking_number: created.awbNumber || null,
    tracking_url: created.trackingUrl ?? null,
    label_url: created.labelUrl ?? null,
    estimated_delivery_at: created.estimatedDeliveryAt?.toISOString() ?? null,
    status: 'shipped',
  }
  await dispatchMerchantWebhook({ merchantId, mode: toKeyMode(testMode), eventType: 'shipment.created', data }).catch(() => null)
  await dispatchMerchantWebhook({ merchantId, mode: toKeyMode(testMode), eventType: 'fulfillment.created', data: { order_id: order.id, order_number: order.orderNumber, fulfillment_id: summary.fulfillment.id, status: 'shipped' } }).catch(() => null)
  await dispatchMerchantWebhook({ merchantId, mode: toKeyMode(testMode), eventType: 'fulfillment.shipped', data }).catch(() => null)

  return { fulfillment: summary.fulfillment, package: summary.package, summary: summary.summary, idempotent: false }
}

async function generateUniqueFulfillmentNumber(tx: Prisma.TransactionClient, merchantId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const number = generateFulfillmentNumber()
    const exists = await tx.fulfillment.findFirst({ where: { merchantId, fulfillmentNumber: number }, select: { id: true } })
    if (!exists) return number
  }
  throw new Error('Unable to generate a unique fulfillment number')
}

export async function getPackageWithProvider(packageId: string, merchantId: string) {
  const pkg = await prisma.package.findFirst({
    where: { id: packageId, merchantId },
    include: {
      fulfillment: { include: { order: { include: { customer: true } } } },
    },
  })
  if (!pkg) throw new Error('Package not found')
  return pkg
}

async function providerFor(pkg: { provider?: string | null; merchantId: string }): Promise<CourierProvider> {
  if (pkg.provider && pkg.provider !== 'mock') {
    const resolved = await getProviderByName(pkg.merchantId, pkg.provider)
    if (resolved.error) throw new Error(resolved.error)
    return resolved.provider
  }
  return getCourierProvider('mock')
}

/** Schedule a pickup with the provider and persist the slot. */
export async function schedulePickupForPackage(params: {
  merchantId: string
  packageId: string
  actorUserId?: string | null
  pickupDate: Date
}): Promise<{ pickupScheduledAt: Date }> {
  const { merchantId, packageId, actorUserId = null, pickupDate } = params
  const pkg = await getPackageWithProvider(packageId, merchantId)
  const provider = await providerFor(pkg)
  const result = await provider.schedulePickup({
    merchantId,
    providerShipmentId: pkg.providerShipmentId,
    awbNumber: pkg.providerShipmentId ? undefined : pkg.awbNumber,
    pickupDate,
  })

  await prisma.package.update({
    where: { id: packageId },
    data: {
      pickupScheduledAt: result.pickupScheduledAt,
      providerMetadata: { ...((pkg.providerMetadata as Record<string, unknown>) || {}), pickup_token: result.pickupToken ?? null } as never,
    },
  })
  await prisma.shipmentEvent.create({
    data: {
      merchantId,
      packageId,
      eventLabel: `Pickup scheduled for ${result.pickupScheduledAt.toISOString().slice(0, 10)}`,
      eventStatus: 'shipped',
      eventAt: new Date(),
      source: 'system',
    },
  })
  await logAudit({ merchantId, actorUserId, action: 'pickup_scheduled', entityType: 'package', entityId: packageId, metadata: { pickup: result.pickupScheduledAt.toISOString() } })
  return { pickupScheduledAt: result.pickupScheduledAt }
}

/** Generate and persist a shipping label. */
export async function generateLabelForPackage(params: {
  merchantId: string
  packageId: string
  actorUserId?: string | null
}): Promise<{ labelUrl: string; contentType: string }> {
  const { merchantId, packageId, actorUserId = null } = params
  const pkg = await getPackageWithProvider(packageId, merchantId)
  const provider = await providerFor(pkg)
  const label = await provider.generateLabel({
    merchantId,
    providerShipmentId: pkg.providerShipmentId,
    awbNumber: pkg.awbNumber,
  })
  await prisma.package.update({ where: { id: packageId }, data: { labelUrl: label.labelUrl } })
  await logAudit({ merchantId, actorUserId, action: 'label_generated', entityType: 'package', entityId: packageId, metadata: { label_url: label.labelUrl } })
  return label
}

/** Cancel a provider shipment. */
export async function cancelProviderPackage(params: {
  merchantId: string
  packageId: string
  actorUserId?: string | null
}): Promise<{ ok: boolean; skipped: boolean }> {
  const { merchantId, packageId, actorUserId = null } = params
  const pkg = await getPackageWithProvider(packageId, merchantId)
  if (!pkg.providerShipmentId && !pkg.awbNumber) {
    // Nothing was shipped to the courier — just mark it locally.
    await prisma.package.update({ where: { id: packageId }, data: { packageStatus: 'cancelled' } })
    return { ok: true, skipped: true }
  }
  const provider = await providerFor(pkg)
  const result = await provider.cancelShipment({ merchantId, providerShipmentId: pkg.providerShipmentId, awbNumber: pkg.awbNumber })
  if (!result.ok) throw new Error(result.error ?? 'Courier did not accept the cancellation')

  await prisma.$transaction(async (tx) => {
    await tx.package.update({ where: { id: packageId }, data: { packageStatus: 'cancelled' } })
    await tx.shipmentEvent.create({ data: { merchantId, packageId, eventLabel: 'Shipment cancelled', eventStatus: 'cancelled', eventAt: new Date(), source: 'system' } })
    await tx.orderStatusHistory.create({
      data: {
        merchantId,
        orderId: pkg.fulfillment.orderId,
        fulfillmentId: pkg.fulfillmentId,
        packageId,
        previousStatus: pkg.packageStatus,
        newStatus: 'cancelled',
        statusType: 'shipment',
        changedByUserId: actorUserId,
        changedByType: 'merchant',
        changeReason: 'Shipment cancelled',
      },
    })
    const f = pkg.fulfillment
    const check = canTransitionFulfillment(f.status, 'cancelled', f.fulfillmentType)
    if (check.ok) await tx.fulfillment.update({ where: { id: f.id }, data: { status: 'cancelled', cancelledAt: new Date() } })
    await recalculateOrderFulfillmentSummary(pkg.fulfillment.orderId, tx)
  })
  await logAudit({ merchantId, actorUserId, action: 'shipment_cancelled', entityType: 'package', entityId: packageId, metadata: { awb: pkg.awbNumber } })
  return { ok: true, skipped: false }
}

/** Initiate an RTO/return for a package. */
export async function initiateReturnForPackage(params: {
  merchantId: string
  packageId: string
  actorUserId?: string | null
  reason?: string | null
}): Promise<{ returnTrackingNumber?: string | null }> {
  const { merchantId, packageId, actorUserId = null, reason = null } = params
  const pkg = await getPackageWithProvider(packageId, merchantId)
  const provider = await providerFor(pkg)
  const result = await provider.createReturnShipment({
    merchantId,
    providerShipmentId: pkg.providerShipmentId,
    awbNumber: pkg.awbNumber,
    reason,
  })

  await prisma.$transaction(async (tx) => {
    await tx.package.update({
      where: { id: packageId },
      data: {
        packageStatus: 'returned',
        rtoInitiatedAt: new Date(),
        returnTrackingNumber: result.returnTrackingNumber ?? null,
        providerMetadata: {
          ...((pkg.providerMetadata as Record<string, unknown>) || {}),
          return_shipment_id: result.returnProviderShipmentId ?? null,
          return_awb: result.returnAwbNumber ?? null,
        } as never,
      },
    })
    await tx.shipmentEvent.create({ data: { merchantId, packageId, eventLabel: reason ? `RTO initiated: ${reason}` : 'RTO initiated', eventStatus: 'returned', eventAt: new Date(), source: 'system' } })
    await tx.orderStatusHistory.create({
      data: {
        merchantId,
        orderId: pkg.fulfillment.orderId,
        fulfillmentId: pkg.fulfillmentId,
        packageId,
        previousStatus: pkg.packageStatus,
        newStatus: 'returned',
        statusType: 'shipment',
        changedByUserId: actorUserId,
        changedByType: 'merchant',
        changeReason: reason ?? 'Return initiated',
      },
    })
    const f = pkg.fulfillment
    const check = canTransitionFulfillment(f.status, 'returned', f.fulfillmentType)
    if (check.ok) await tx.fulfillment.update({ where: { id: f.id }, data: { status: 'returned' } })
    await recalculateOrderFulfillmentSummary(pkg.fulfillment.orderId, tx)
  })
  await notifyShipmentMilestone({ merchantId, packageId, status: 'returned' }).catch(() => null)
  await logAudit({ merchantId, actorUserId, action: 'return_initiated', entityType: 'package', entityId: packageId, metadata: { reason } })
  return { returnTrackingNumber: result.returnTrackingNumber ?? null }
}

/** Pull the latest status from the provider and apply it to a package. */
export async function syncPackageFromProvider(params: {
  merchantId: string
  packageId: string
}) {
  const { merchantId, packageId } = params
  const pkg = await getPackageWithProvider(packageId, merchantId)
  if (!pkg.provider || pkg.provider === 'mock') {
    return { skipped: true, reason: 'Package is not tracked by a live provider' }
  }
  const provider = await providerFor(pkg)
  const status = await provider.getShipmentStatus({
    awbNumber: pkg.awbNumber,
    providerShipmentId: pkg.providerShipmentId,
  })
  const result = await applyCourierTrackingUpdate({
    merchantId,
    packageId,
    providerName: pkg.provider,
    status: status.status,
    events: status.events,
    estimatedDeliveryAt: status.estimatedDeliveryAt ?? null,
    rtoInitiated: status.rtoInitiated,
    rtoDelivered: status.rtoDelivered,
    returnTrackingNumber: status.returnTrackingNumber,
    trackingUrl: status.trackingUrl,
    trigger: 'sync',
  })
  return result
}