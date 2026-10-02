import { prisma } from '@/lib/prisma'
import type { FulfillmentSummaryStatus, Prisma } from '@prisma/client'

type FulfillmentWithItems = Prisma.FulfillmentGetPayload<{
  include: { items: true; packages: true }
}>

const TERMINAL_FAILURE_STATES = ['delivery_failed', 'returned']
const DELIVERED_STATES = ['delivered', 'returned'] // returned counts as delivered-as-far-as-shipping

/**
 * Recompute the parent order's fulfillment summary status based on the
 * quantity shipped vs. delivered across all active fulfillments.
 *
 * Rules:
 * - No fulfilled quantity: unfulfilled
 * - Some fulfilled quantity but not all: partially_fulfilled
 * - All quantity shipped / fulfilled but not all delivered: fulfilled
 * - At least one delivered fulfillment and other active/un-delivered exists: partially_delivered
 * - All shippable quantities delivered: delivered
 * - Any fulfillment has delivery_failed or returned: attention_required
 * - All items cancelled / no active fulfillment: cancelled
 *
 * Accepts an optional transaction client so callers can compute the summary
 * from within the same transaction that changed the fulfillments/packages.
 */
export async function recalculateOrderFulfillmentSummary(
  orderId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<FulfillmentSummaryStatus> {
  const order = await client.order.findUnique({
    where: { id: orderId },
    include: {
      orderItems: true,
      fulfillments: { include: { items: true, packages: true } },
    },
  })

  if (!order) return 'unfulfilled'

  const status = computeFulfillmentSummary(order)
  if (status !== order.fulfillmentSummaryStatus) {
    await client.order.update({
      where: { id: orderId },
      data: { fulfillmentSummaryStatus: status },
    })
  }
  return status
}

export function computeFulfillmentSummary(order: {
  orderItems: Array<{ quantityOrdered: number; quantityCancelled: number }>
  fulfillments: FulfillmentWithItems[]
}): FulfillmentSummaryStatus {
  const items = order.orderItems
  if (items.length === 0) return 'unfulfilled'

  const activeFulfillments = order.fulfillments.filter(f => f.status !== 'cancelled')
  if (activeFulfillments.length === 0) {
    // All items cancelled -> cancelled, otherwise unfulfilled
    const allCancelled = items.every(i => i.quantityCancelled >= i.quantityOrdered)
    return allCancelled ? 'cancelled' : 'unfulfilled'
  }

  // If any active fulfillment is in failure/returned state -> attention_required
  const hasFailure = activeFulfillments.some(f =>
    TERMINAL_FAILURE_STATES.includes(f.status) ||
    f.packages.some(p => TERMINAL_FAILURE_STATES.includes(p.packageStatus))
  )
  if (hasFailure) return 'attention_required'

  const anyCanceledFulfillment = order.fulfillments.some(f => f.status === 'cancelled')
  const totalOrdered = items.reduce((sum, i) => sum + i.quantityOrdered, 0)
  if (totalOrdered <= 0) return 'unfulfilled'

  // Compute quantity shipped and delivered per order item across active fulfillments
  let shippedQty = 0
  let deliveredQty = 0
  const cancelledQty = items.reduce((sum, i) => sum + i.quantityCancelled, 0)
  const remainingOrdered = totalOrdered - cancelledQty

  for (const f of activeFulfillments) {
    let fulfillmentDelivered = f.status === 'delivered'
    // A shippable fulfillment is only delivered when its package is delivered too
    if (f.fulfillmentType === 'shipping' && f.packages.length > 0) {
      fulfillmentDelivered = f.packages.some(p => p.packageStatus === 'delivered')
    }
    for (const item of f.items) {
      shippedQty += item.quantity
      if (fulfillmentDelivered) deliveredQty += item.quantity
    }
  }

  // If nothing was ever shipped but all ordered quantities were cancelled -> cancelled
  if (shippedQty === 0 && cancelledQty >= totalOrdered) return 'cancelled'
  if (anyCanceledFulfillment && shippedQty === 0) return 'unfulfilled'

  if (remainingOrdered > 0) {
    if (deliveredQty >= remainingOrdered) {
      // All shippable quantities delivered
      return 'delivered'
    }
    if (shippedQty < remainingOrdered) {
      if (shippedQty === 0) return 'unfulfilled'
      if (deliveredQty > 0) return 'partially_delivered'
      return 'partially_fulfilled'
    }
    // All quantity shipped but not all delivered
    if (deliveredQty > 0 && deliveredQty < shippedQty) return 'partially_delivered'
    return 'fulfilled'
  }

  return 'fulfilled'
}