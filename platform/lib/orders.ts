import { prisma } from '@/lib/prisma'
import { generateOrderNumber, generateTrackingToken } from '@/lib/status'
import { logAudit } from '@/lib/audit'
import { restoreStockForOrder } from '@/lib/inventory'
import { decidePaymentStatusChange } from '@/lib/payment-transitions'
import type {
  OrderSource,
  PaymentStatus,
  OrderStatus,
  FulfillmentType,
} from '@prisma/client'

export interface OrderItemInput {
  productId?: string | null
  productName: string
  sku?: string | null
  unitPrice: number
  quantity: number
}

export interface CreateOrderInput {
  merchantId: string
  actorUserId?: string | null
  customerId?: string | null
  customer?: {
    fullName: string
    phone?: string | null
    email?: string | null
  } | null
  source?: OrderSource
  items: OrderItemInput[]
  discountAmount?: number
  shippingAmount?: number
  taxAmount?: number
  shippingAddress?: Record<string, unknown> | null
  billingAddress?: Record<string, unknown> | null
  internalNotes?: string | null
  customerNote?: string | null
  paymentStatus?: PaymentStatus
  orderStatus?: OrderStatus
  testMode?: boolean
  merchantOrderReference?: string | null
  checkoutLinkId?: string | null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Create a manual order inside a transaction.
 * - Generates a unique, readable order number (TP-YYYY-XXXX).
 * - Computes subtotal / discount / shipping / tax / total.
 * - Creates order items.
 * - Updates customer totals (order count + spend).
 * - Creates order status history + audit log.
 */
export async function createOrder(input: CreateOrderInput) {
  const {
    merchantId,
    actorUserId = null,
    customerId = null,
    customer = null,
    source = 'manual_order',
    items,
    discountAmount = 0,
    shippingAmount = 0,
    taxAmount = 0,
    shippingAddress = null,
    billingAddress = null,
    internalNotes = null,
    customerNote = null,
    paymentStatus = 'pending',
    orderStatus = 'new',
    testMode = false,
    merchantOrderReference = null,
    checkoutLinkId = null,
  } = input

  if (!items.length) throw new Error('Order must have at least one item')

  const discount = round2(discountAmount)
  const shipping = round2(shippingAmount)
  const tax = round2(taxAmount)

  let subtotal = 0
  for (const item of items) {
    if (item.quantity < 1) throw new Error(`Invalid quantity for ${item.productName}`)
    if (item.unitPrice < 0) throw new Error(`Invalid price for ${item.productName}`)
    subtotal = round2(subtotal + round2(item.unitPrice) * item.quantity)
  }
  subtotal = round2(subtotal)
  const total = round2(subtotal - discount + shipping + tax)
  if (total < 0) throw new Error('Total amount cannot be negative')

  return prisma.$transaction(
    async (tx) => {
    // Generate a unique order number
    let orderNumber = ''
    for (let attempt = 0; attempt < 5; attempt++) {
      orderNumber = generateOrderNumber()
      const existing = await tx.order.findFirst({
        where: { merchantId, orderNumber },
        select: { id: true },
      })
      if (!existing) break
      orderNumber = ''
    }
    if (!orderNumber) throw new Error('Unable to generate a unique order number, try again')

    // Resolve or create inline customer
    let resolvedCustomerId = customerId
    if (customerId) {
      const owned = await tx.customer.findFirst({
        where: { id: customerId, merchantId },
        select: { id: true },
      })
      if (!owned) throw new Error('Customer not found')
      resolvedCustomerId = owned.id
    } else if (customer) {
      const created = await tx.customer.create({
        data: {
          merchantId,
          fullName: customer.fullName,
          phone: customer.phone ?? null,
          email: customer.email ?? null,
        },
      })
      resolvedCustomerId = created.id
    }

    const trackingToken = generateTrackingToken()

    const order = await tx.order.create({
      data: {
        merchantId,
        customerId: resolvedCustomerId,
        orderNumber,
        source,
        testMode,
        merchantOrderReference,
        checkoutLinkId,
        currency: 'INR',
        subtotalAmount: subtotal,
        discountAmount: discount,
        shippingAmount: shipping,
        taxAmount: tax,
        totalAmount: total,
        paymentStatus,
        orderStatus: orderStatus === 'pending_payment' ? 'pending_payment' : orderStatus,
        shippingAddressSnapshot: (shippingAddress as object) ?? undefined,
        billingAddressSnapshot: (billingAddress as object) ?? undefined,
        internalNotes,
        customerNote,
        trackingToken,
        paidAt: paymentStatus === 'paid' ? new Date() : null,
      },
    })

    for (const item of items) {
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          productId: item.productId ?? null,
          productNameSnapshot: item.productName,
          skuSnapshot: item.sku ?? null,
          unitPrice: round2(item.unitPrice),
          quantityOrdered: item.quantity,
          lineTotal: round2(round2(item.unitPrice) * item.quantity),
        },
      })
    }

    await tx.orderStatusHistory.create({
      data: {
        merchantId,
        orderId: order.id,
        previousStatus: null,
        newStatus: order.orderStatus,
        statusType: 'order',
        changedByUserId: actorUserId,
        changedByType: 'merchant',
        changeReason: 'Order created',
      },
    })

    if (paymentStatus === 'paid') {
      await tx.orderStatusHistory.create({
        data: {
          merchantId,
          orderId: order.id,
          previousStatus: null,
          newStatus: 'paid',
          statusType: 'payment',
          changedByUserId: actorUserId,
          changedByType: 'merchant',
          changeReason: 'Payment marked as paid at order creation',
        },
      })
    }

    await logAudit({
      merchantId,
      actorUserId,
      action: 'order_created',
      entityType: 'order',
      entityId: order.id,
      metadata: { order_number: orderNumber, total: total, items: items.length },
    })

    // Update customer totals
    if (resolvedCustomerId) {
      const stats = await tx.order.aggregate({
        where: { merchantId, customerId: resolvedCustomerId, orderStatus: { not: 'cancelled' } },
        _count: { id: true },
        _sum: { totalAmount: true },
        _max: { createdAt: true },
      })
      await tx.customer.update({
        where: { id: resolvedCustomerId },
        data: {
          totalOrders: stats._count.id,
          totalSpent: stats._sum.totalAmount?.toNumber() ?? 0,
          lastOrderAt: stats._max.createdAt,
        },
      })
    }

    return tx.order.findUnique({
      where: { id: order.id },
      include: { orderItems: true, customer: true },
    })
  },
  { timeout: 30000 }
  )
}

/**
 * Set a manual order status with transition validation + history + audit.
 */
export async function setOrderStatus(params: {
  merchantId: string
  orderId: string
  actorUserId?: string | null
  nextStatus: OrderStatus
  reason?: string | null
}) {
  const { merchantId, orderId, actorUserId = null, nextStatus, reason = null } = params

  return await (async () => {
    const updated = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, merchantId },
    })
    if (!order) throw new Error('Order not found')

    if (nextStatus === 'cancelled') {
      if (order.orderStatus === 'cancelled') return order
      if (['completed'].includes(order.orderStatus)) throw new Error('Completed orders cannot be cancelled')
      // cancelled orders keep totals, but do not count towards customer spend next time we recalc
    } else {
      if (order.orderStatus === 'cancelled') throw new Error('Cancelled orders cannot be reactivated in the normal UI')
    }

    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        orderStatus: nextStatus,
        cancelledAt: nextStatus === 'cancelled' ? new Date() : order.cancelledAt,
        completedAt: nextStatus === 'completed' ? new Date() : order.completedAt,
      },
    })

    await tx.orderStatusHistory.create({
      data: {
        merchantId,
        orderId,
        previousStatus: order.orderStatus,
        newStatus: nextStatus,
        statusType: 'order',
        changedByUserId: actorUserId,
        changedByType: 'merchant',
        changeReason: reason,
      },
    })

    await logAudit({
      merchantId,
      actorUserId,
      action: 'order_status_changed',
      entityType: 'order',
      entityId: orderId,
      metadata: { from: order.orderStatus, to: nextStatus, reason },
    })

    // Refresh customer totals when order is cancelled
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

    return updated
  })
    if (nextStatus === 'cancelled') {
      await restoreStockForOrder({ merchantId, orderId, reason: reason ?? 'Order cancelled', actorUserId }).catch(() => {})
    }
    return updated
  })()
}

/**
 * Set manual payment status with transition validation + history + audit.
 */
export async function setPaymentStatus(params: {
  merchantId: string
  orderId: string
  actorUserId?: string | null
  nextStatus: PaymentStatus
  reason?: string | null
}) {
  const { merchantId, orderId, actorUserId = null, nextStatus, reason = null } = params

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, merchantId },
    })
    if (!order) throw new Error('Order not found')

    const decision = decidePaymentStatusChange(order.paymentStatus, nextStatus)
    if (decision.action === 'blocked') throw new Error(decision.reason)
    if (decision.action === 'unchanged') return order

    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: nextStatus,
        paidAt: nextStatus === 'paid' ? new Date() : order.paidAt,
      },
    })

    await tx.orderStatusHistory.create({
      data: {
        merchantId,
        orderId,
        previousStatus: order.paymentStatus,
        newStatus: nextStatus,
        statusType: 'payment',
        changedByUserId: actorUserId,
        changedByType: 'merchant',
        changeReason: reason,
      },
    })

    await logAudit({
      merchantId,
      actorUserId,
      action: 'payment_status_changed',
      entityType: 'order',
      entityId: orderId,
      metadata: { from: order.paymentStatus, to: nextStatus, reason },
    })

    return updated
  })
}

/**
 * Add or update internal notes on an order.
 */
export async function updateOrderNotes(params: {
  merchantId: string
  orderId: string
  actorUserId?: string | null
  internalNotes?: string | null
}) {
  const { merchantId, orderId, actorUserId = null, internalNotes } = params
  const order = await prisma.order.findFirst({ where: { id: orderId, merchantId } })
  if (!order) throw new Error('Order not found')

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { internalNotes },
  })

  await logAudit({
    merchantId,
    actorUserId,
    action: 'order_notes_updated',
    entityType: 'order',
    entityId: orderId,
  })
  return updated
}