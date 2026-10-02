import { prisma } from '@/lib/prisma'
import {
  generateFulfillmentNumber,
  canTransitionFulfillment,
  canTransitionOrder,
} from '@/lib/status'
import { recalculateOrderFulfillmentSummary } from '@/lib/fulfillment-summary'
import { logAudit } from '@/lib/audit'
import { restoreStockForOrder } from '@/lib/inventory'
import type { FulfillmentStatus, FulfillmentType, PackageStatus, ShipmentEventSource } from '@prisma/client'

export interface FulfillmentItemInput {
  orderItemId: string
  quantity: number
}

/**
 * Create a fulfillment (shipment) for an order.
 *
 * Validation rules:
 * - Only unfulfilled quantity may be selected.
 * - A fulfillment item quantity must not exceed the remaining quantity of its order item.
 * - The same quantity cannot be assigned to more than one fulfillment.
 * - Support split shipments: multiple fulfillments per order.
 */
export async function createFulfillment(params: {
  merchantId: string
  orderId: string
  actorUserId?: string | null
  fulfillmentType: FulfillmentType
  items: FulfillmentItemInput[]
}) {
  const { merchantId, orderId, actorUserId = null, fulfillmentType, items } = params

  if (!items.length) throw new Error('Select at least one item')
  if (fulfillmentType === 'shipping' || fulfillmentType === 'local_delivery') {
    // shipping always needs a package; other types may not
  }

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, merchantId },
      include: { orderItems: true },
    })
    if (!order) throw new Error('Order not found')
    if (order.orderStatus === 'cancelled') throw new Error('Cannot fulfill a cancelled order')
    if (order.orderStatus === 'completed') throw new Error('Cannot fulfill a completed order')

    const existingFulfillments = await tx.fulfillment.findMany({
      where: { orderId, status: { not: 'cancelled' } },
      include: { items: true },
    })

    // Build used quantities per order item
    const used = new Map<string, number>()
    for (const f of existingFulfillments) {
      for (const fi of f.items) {
        used.set(fi.orderItemId, (used.get(fi.orderItemId) ?? 0) + fi.quantity)
      }
    }

    // Validate items belong to this order + quantities
    const remainingByItem = new Map<string, number>()
    const validItemIds = new Set(order.orderItems.map(i => i.id))
    for (const item of order.orderItems) {
      const previouslyUsed = used.get(item.id) ?? 0
      remainingByItem.set(item.id, item.quantityOrdered - item.quantityCancelled - previouslyUsed)
    }

    for (const input of items) {
      if (!validItemIds.has(input.orderItemId)) throw new Error('Item does not belong to this order')
      if (input.quantity < 1) throw new Error('Quantity must be at least 1')
      const remaining = remainingByItem.get(input.orderItemId) ?? 0
      if (input.quantity > remaining) {
        throw new Error(`Cannot fulfill more than the remaining quantity for an item (remaining: ${remaining})`)
      }
    }

    // Generate unique fulfillment number
    let fulfillmentNumber = ''
    for (let attempt = 0; attempt < 5; attempt++) {
      fulfillmentNumber = generateFulfillmentNumber()
      const exists = await tx.fulfillment.findFirst({
        where: { merchantId, fulfillmentNumber },
        select: { id: true },
      })
      if (!exists) break
      fulfillmentNumber = ''
    }
    if (!fulfillmentNumber) throw new Error('Unable to generate a unique fulfillment number')

    const fulfillment = await tx.fulfillment.create({
      data: {
        merchantId,
        orderId,
        fulfillmentNumber,
        fulfillmentType,
        status: 'unfulfilled',
      },
    })

    for (const input of items) {
      await tx.fulfillmentItem.create({
        data: {
          fulfillmentId: fulfillment.id,
          orderItemId: input.orderItemId,
          quantity: input.quantity,
        },
      })
      // Update order item fulfilled quantity
      const orderItem = order.orderItems.find(i => i.id === input.orderItemId)
      if (orderItem) {
        const previouslyUsed = used.get(input.orderItemId) ?? 0
        await tx.orderItem.update({
          where: { id: input.orderItemId },
          data: { quantityFulfilled: previouslyUsed + input.quantity },
        })
      }
    }

    // Create a package for shipping/local delivery fulfillment (one package per fulfillment in Phase 1)
    if (fulfillmentType === 'shipping' || fulfillmentType === 'local_delivery') {
      await tx.package.create({
        data: { merchantId, fulfillmentId: fulfillment.id },
      })
    }

    await tx.orderStatusHistory.create({
      data: {
        merchantId,
        orderId,
        fulfillmentId: fulfillment.id,
        previousStatus: null,
        newStatus: 'unfulfilled',
        statusType: 'fulfillment',
        changedByUserId: actorUserId,
        changedByType: 'merchant',
        changeReason: `Fulfillment ${fulfillmentNumber} created`,
      },
    })

    await logAudit({
      merchantId,
      actorUserId,
      action: 'fulfillment_created',
      entityType: 'fulfillment',
      entityId: fulfillment.id,
      metadata: { order_number: order.orderNumber, fulfillment_number: fulfillmentNumber, item_count: items.length },
    })

    const summary = await recalculateOrderFulfillmentSummary(orderId, tx)
    if (order.fulfillmentSummaryStatus !== summary) {
      await tx.orderStatusHistory.create({
        data: {
          merchantId,
          orderId,
          previousStatus: order.fulfillmentSummaryStatus,
          newStatus: summary,
          statusType: 'fulfillment',
          changedByUserId: actorUserId,
          changedByType: 'system',
          changeReason: 'Fulfillment summary recalculated after fulfillment creation',
        },
      })
    }

    return tx.fulfillment.findUnique({
      where: { id: fulfillment.id },
      include: { items: { include: { orderItem: true } }, packages: true },
    })
  })
}

/**
 * Update a fulfillment status with transition validation.
 * Runs summary recalc + history + audit on every change.
 */
export async function updateFulfillmentStatus(params: {
  merchantId: string
  orderId: string
  fulfillmentId: string
  actorUserId?: string | null
  nextStatus: FulfillmentStatus
  reason?: string | null
}) {
  const { merchantId, orderId, fulfillmentId, actorUserId = null, nextStatus, reason = null } = params

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, merchantId } })
    if (!order) throw new Error('Order not found')

    const fulfillment = await tx.fulfillment.findFirst({
      where: { id: fulfillmentId, merchantId },
    })
    if (!fulfillment) throw new Error('Fulfillment not found')

    const check = canTransitionFulfillment(fulfillment.status, nextStatus, fulfillment.fulfillmentType)
    if (!check.ok) throw new Error(check.error)

    const timestamps: Partial<Record<string, Date>> = {}
    if (nextStatus === 'processing') timestamps.processingAt = new Date()
    if (nextStatus === 'packed') timestamps.packedAt = new Date()
    if (nextStatus === 'shipped') timestamps.shippedAt = new Date()
    if (nextStatus === 'delivered') timestamps.deliveredAt = new Date()
    if (nextStatus === 'cancelled') timestamps.cancelledAt = new Date()

    const updated = await tx.fulfillment.update({
      where: { id: fulfillmentId },
      data: { status: nextStatus, ...timestamps },
    })

    await tx.orderStatusHistory.create({
      data: {
        merchantId,
        orderId,
        fulfillmentId,
        previousStatus: fulfillment.status,
        newStatus: nextStatus,
        statusType: 'fulfillment',
        changedByUserId: actorUserId,
        changedByType: 'merchant',
        changeReason: reason,
      },
    })

    await logAudit({
      merchantId,
      actorUserId,
      action: 'fulfillment_status_changed',
      entityType: 'fulfillment',
      entityId: fulfillmentId,
      metadata: { from: fulfillment.status, to: nextStatus, reason },
    })

    // Keep the package in sync
    const packages = await tx.package.findMany({ where: { fulfillmentId } })
    const pkg = packages[0]
    if (pkg && nextStatus !== 'unfulfilled' && nextStatus !== 'cancelled') {
      const pkgStatus = mapFulfillmentToPackageStatus(nextStatus)
      if (pkgStatus) {
        await tx.package.update({
          where: { id: pkg.id },
          data: {
            packageStatus: pkgStatus,
            shippedAt: nextStatus === 'shipped' ? new Date() : pkg.shippedAt,
            deliveredAt: nextStatus === 'delivered' ? new Date() : pkg.deliveredAt,
          },
        })
      }
    }

    const summary = await recalculateOrderFulfillmentSummary(orderId, tx)
    return { fulfillment: updated, summary }
  })
}

function mapFulfillmentToPackageStatus(status: FulfillmentStatus): PackageStatus | null {
  switch (status) {
    case 'processing':
    case 'packed':
      return 'not_shipped'
    case 'shipped':
      return 'shipped'
    case 'in_transit':
      return 'in_transit'
    case 'out_for_delivery':
      return 'out_for_delivery'
    case 'delivered':
      return 'delivered'
    case 'delivery_failed':
      return 'delivery_failed'
    case 'returned':
      return 'returned'
    case 'cancelled':
      return 'cancelled'
    default:
      return null
  }
}

/**
 * Add or update tracking details on a package and mark the fulfillment shipped
 * if it's currently pre-shipment.
 */
export async function addPackageTracking(params: {
  merchantId: string
  orderId: string
  packageId: string
  actorUserId?: string | null
  courierProvider?: string | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  estimatedDeliveryAt?: Date | null
  markShipped?: boolean
}) {
  const { merchantId, orderId, packageId, actorUserId = null, markShipped = true } = params

  return prisma.$transaction(async (tx) => {
    const pkg = await tx.package.findFirst({
      where: { id: packageId, merchantId },
      include: { fulfillment: true },
    })
    if (!pkg) throw new Error('Package not found')
    if (pkg.fulfillment.orderId !== orderId) throw new Error('Package does not belong to this order')

    const updated = await tx.package.update({
      where: { id: packageId },
      data: {
        courierProvider: params.courierProvider ?? pkg.courierProvider,
        trackingNumber: params.trackingNumber ?? pkg.trackingNumber,
        trackingUrl: params.trackingUrl ?? pkg.trackingUrl,
        estimatedDeliveryAt: params.estimatedDeliveryAt ?? pkg.estimatedDeliveryAt,
      },
    })

    await logAudit({
      merchantId,
      actorUserId,
      action: 'tracking_added',
      entityType: 'package',
      entityId: packageId,
      metadata: {
        courier: updated.courierProvider,
        tracking_number: updated.trackingNumber,
      },
    })

    // If tracking added, mark shipped (unless package already moved past shipped).
    // Shipping is a fast-track action (merchant records a tracking number): we
    // allow it from unfulfilled/processing/packed without forcing the manual
    // transition chain. Everything happens inside this transaction.
    let statusChangedTo: FulfillmentStatus | null = null
    if (markShipped && updated.trackingNumber && ['unfulfilled', 'processing', 'packed'].includes(pkg.fulfillment.status)) {
      const now = new Date()
      statusChangedTo = 'shipped'

      await tx.fulfillment.update({
        where: { id: pkg.fulfillmentId },
        data: { status: 'shipped', shippedAt: now },
      })

      await tx.package.update({
        where: { id: packageId },
        data: { packageStatus: 'shipped', shippedAt: now },
      })

      await tx.orderStatusHistory.create({
        data: {
          merchantId,
          orderId,
          fulfillmentId: pkg.fulfillmentId,
          previousStatus: pkg.fulfillment.status,
          newStatus: 'shipped',
          statusType: 'fulfillment',
          changedByUserId: actorUserId,
          changedByType: 'merchant',
          changeReason: 'Tracking number added',
        },
      })

      await tx.shipmentEvent.create({
        data: {
          merchantId,
          packageId,
          eventLabel: 'Shipped',
          eventStatus: 'shipped',
          eventAt: now,
          source: 'merchant',
        },
      })

      await recalculateOrderFulfillmentSummary(orderId, tx)
      await logAudit({
        merchantId,
        actorUserId,
        action: 'fulfillment_status_changed',
        entityType: 'fulfillment',
        entityId: pkg.fulfillmentId,
        metadata: { from: pkg.fulfillment.status, to: 'shipped', reason: 'Tracking number added' },
      })
    }

    return { package: updated, fulfillmentStatus: statusChangedTo }
  })
}

/**
 * Set a package status directly (used by merchant manual events / status buttons).
 */
export async function setPackageStatus(params: {
  merchantId: string
  orderId: string
  packageId: string
  actorUserId?: string | null
  nextStatus: PackageStatus
}) {
  const { merchantId, orderId, packageId, actorUserId = null, nextStatus } = params

  return prisma.$transaction(async (tx) => {
    const pkg = await tx.package.findFirst({
      where: { id: packageId, merchantId },
      include: { fulfillment: true },
    })
    if (!pkg) throw new Error('Package not found')
    if (pkg.fulfillment.orderId !== orderId) throw new Error('Package does not belong to this order')

    const updated = await tx.package.update({
      where: { id: packageId },
      data: {
        packageStatus: nextStatus,
        shippedAt: nextStatus === 'shipped' ? new Date() : pkg.shippedAt,
        deliveredAt: nextStatus === 'delivered' ? new Date() : pkg.deliveredAt,
      },
    })

    await tx.orderStatusHistory.create({
      data: {
        merchantId,
        orderId,
        fulfillmentId: pkg.fulfillmentId,
        packageId,
        previousStatus: pkg.packageStatus,
        newStatus: nextStatus,
        statusType: 'shipment',
        changedByUserId: actorUserId,
        changedByType: 'merchant',
        changeReason: 'Package status updated',
      },
    })

    await logAudit({
      merchantId,
      actorUserId,
      action: 'package_status_changed',
      entityType: 'package',
      entityId: packageId,
      metadata: { from: pkg.packageStatus, to: nextStatus },
    })

    const summary = await recalculateOrderFulfillmentSummary(orderId, tx)

    // Mirror back to fulfillment if possible
    const mirror: Partial<Record<PackageStatus, FulfillmentStatus>> = {
      shipped: 'shipped',
      in_transit: 'in_transit',
      out_for_delivery: 'out_for_delivery',
      delivered: 'delivered',
      delivery_failed: 'delivery_failed',
      returned: 'returned',
      cancelled: 'cancelled',
    }
    const targetFulfillmentStatus = mirror[nextStatus]
    let fulfillmentStatus = pkg.fulfillment.status
    if (targetFulfillmentStatus) {
      const check = canTransitionFulfillment(pkg.fulfillment.status, targetFulfillmentStatus, pkg.fulfillment.fulfillmentType)
      if (check.ok) {
        const ts: Partial<Record<string, Date>> = {}
        if (targetFulfillmentStatus === 'shipped') ts.shippedAt = new Date()
        if (targetFulfillmentStatus === 'delivered') ts.deliveredAt = new Date()
        await tx.fulfillment.update({
          where: { id: pkg.fulfillmentId },
          data: { status: targetFulfillmentStatus, ...ts },
        })
        fulfillmentStatus = targetFulfillmentStatus
      }
    }

    return { package: updated, summary, fulfillmentStatus }
  })
}

/**
 * Add a manual shipment event (delivery timeline entry).
 */
export async function addShipmentEvent(params: {
  merchantId: string
  orderId: string
  packageId: string
  actorUserId?: string | null
  eventLabel: string
  eventStatus?: string
  location?: string | null
  eventAt?: Date | null
  source?: ShipmentEventSource
}) {
  const { merchantId, orderId, packageId, actorUserId = null, eventLabel, eventStatus = 'info', location = null, eventAt, source = 'merchant' } = params

  return prisma.$transaction(async (tx) => {
    const pkg = await tx.package.findFirst({
      where: { id: packageId, merchantId },
      include: { fulfillment: true },
    })
    if (!pkg) throw new Error('Package not found')
    if (pkg.fulfillment.orderId !== orderId) throw new Error('Package does not belong to this order')

    const event = await tx.shipmentEvent.create({
      data: {
        merchantId,
        packageId,
        eventLabel,
        eventStatus,
        location,
        eventAt: eventAt ?? new Date(),
        source,
      },
    })

    await tx.orderStatusHistory.create({
      data: {
        merchantId,
        orderId,
        fulfillmentId: pkg.fulfillmentId,
        packageId,
        previousStatus: null,
        newStatus: eventStatus,
        statusType: 'shipment',
        changedByUserId: actorUserId,
        changedByType: source === 'system' ? 'system' : 'merchant',
        changeReason: eventLabel,
      },
    })

    await logAudit({
      merchantId,
      actorUserId,
      action: 'shipment_event_added',
      entityType: 'package',
      entityId: packageId,
      metadata: { label: eventLabel, status: eventStatus, location },
    })

    return event
  })
}

/**
 * Cancel an order entirely. Cancels eligible fulfillments too.
 */
export async function cancelOrder(params: {
  merchantId: string
  orderId: string
  actorUserId?: string | null
  reason?: string | null
}) {
  const { merchantId, orderId, actorUserId = null, reason = null } = params

  const cancelled = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, merchantId },
      include: { fulfillments: true, orderItems: true },
    })
    if (!order) throw new Error('Order not found')
    if (order.orderStatus === 'completed') throw new Error('Completed orders cannot be cancelled')
    if (order.orderStatus === 'cancelled') return order

    const check = canTransitionOrder(order.orderStatus, 'cancelled')
    if (!check.ok) throw new Error(check.error)

    for (const f of order.fulfillments) {
      if (f.status === 'delivered' || f.status === 'in_transit' || f.status === 'out_for_delivery' || f.status === 'shipped') {
        // Do not cancel a moving/delivered fulfillment — but order cancellation handles attention state.
      }
    }

    await tx.order.update({
      where: { id: orderId },
      data: {
        orderStatus: 'cancelled',
        cancelledAt: new Date(),
        fulfillmentSummaryStatus: 'cancelled',
      },
    })

    // Mark order items as cancelled for remaining quantity
    for (const item of order.orderItems) {
      const remainder = item.quantityOrdered - item.quantityFulfilled
      if (remainder > 0) {
        await tx.orderItem.update({
          where: { id: item.id },
          data: { quantityCancelled: item.quantityCancelled + remainder },
        })
      }
    }

    // Cancel unshipped fulfillments
    for (const f of order.fulfillments) {
      if (['unfulfilled', 'processing', 'packed'].includes(f.status)) {
        await tx.fulfillment.update({
          where: { id: f.id },
          data: { status: 'cancelled', cancelledAt: new Date() },
        })
      }
    }

    await tx.orderStatusHistory.create({
      data: {
        merchantId,
        orderId,
        previousStatus: order.orderStatus,
        newStatus: 'cancelled',
        statusType: 'order',
        changedByUserId: actorUserId,
        changedByType: 'merchant',
        changeReason: reason,
      },
    })

    await logAudit({
      merchantId,
      actorUserId,
      action: 'order_cancelled',
      entityType: 'order',
      entityId: orderId,
      metadata: { reason },
    })

    if (order.customerId) {
      const stats = await tx.order.aggregate({
        where: { merchantId, customerId: order.customerId, orderStatus: { not: 'cancelled' } },
        _count: { id: true },
        _sum: { totalAmount: true },
        _max: { createdAt: true },
      })
      await tx.customer.update({
        where: { id: order.customerId },
        data: {
          totalOrders: stats._count.id,
          totalSpent: stats._sum.totalAmount?.toNumber() ?? 0,
          lastOrderAt: stats._max.createdAt,
        },
      })
    }

    return { order }
  })
  // Restore previously-deducted stock when the merchant setting allows it.
  await restoreStockForOrder({ merchantId, orderId, reason: reason ?? 'Order cancelled', actorUserId }).catch(() => {})
  return cancelled
}