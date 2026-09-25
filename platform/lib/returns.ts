import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { generateOrderNumber } from '@/lib/status'
import { triggerMessageAutomations } from '@/lib/messaging/engine'
import { restoreStockForReturnItems } from './inventory'

export interface ReturnItemInput {
  orderItemId: string
  quantity: number
  reason?: string
  conditionNotes?: string
}

export interface CreateReturnInput {
  merchantId: string
  orderId: string
  customerId?: string | null
  reason?: string
  customerComment?: string
  items: ReturnItemInput[]
  actorUserId?: string | null
}

function generateReturnNumber(): string {
  return generateOrderNumber().replace('TP', 'RTR')
}

const RETURN_TRANSITIONS: Record<string, string[]> = {
  requested: ['approved', 'rejected'],
  approved: ['return_pickup_scheduled', 'returned_to_merchant', 'rejected'],
  return_pickup_scheduled: ['return_in_transit', 'returned_to_merchant'],
  return_in_transit: ['returned_to_merchant'],
  returned_to_merchant: ['refund_pending'],
  refund_pending: ['refund_initiated'],
  refund_initiated: ['refunded'],
  refunded: ['closed'],
  rejected: ['closed'],
}

/** Verify a return can move from one status to another. */
export function canTransitionReturn(from: string, to: string): boolean {
  return (RETURN_TRANSITIONS[from] ?? []).includes(to)
}

async function buildReturnNumber(merchantId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const number = generateReturnNumber()
    const existing = await prisma.returnRequest.findFirst({ where: { merchantId, returnNumber: number } })
    if (!existing) return number
  }
  throw new Error('Unable to generate a unique return number, try again')
}

/**
 * Create a return request. Validates that the requested quantity never
 * exceeds what has actually been delivered (and not already returned).
 */
export async function createReturnRequest(input: CreateReturnInput) {
  const { merchantId, orderId, items, actorUserId = null } = input
  if (!items.length) throw new Error('Return must have at least one item')

  const order = await prisma.order.findFirst({
    where: { id: orderId, merchantId },
    include: { orderItems: true },
  })
  if (!order) throw new Error('Order not found')

  const returnNumber = await buildReturnNumber(merchantId)

  const rows = await Promise.all(
    items.map(async item => {
      const orderItem = order.orderItems.find(oi => oi.id === item.orderItemId)
      if (!orderItem) throw new Error('Order item not found on this order')
      if (item.quantity < 1) throw new Error(`Invalid quantity for ${orderItem.productNameSnapshot}`)

      // "Cannot exceed delivered quantity": min(delivered so far, remaining orderable).
      const deliveredSoFar = orderItem.quantityFulfilled - orderItem.quantityReturned
      const remaining = orderItem.quantityOrdered - orderItem.quantityCancelled - orderItem.quantityReturned
      const available = Math.min(deliveredSoFar, remaining)
      if (item.quantity > available) {
        throw new Error(
          `Return for ${orderItem.productNameSnapshot} cannot exceed delivered quantity (requested ${item.quantity}, available ${available})`,
        )
      }
      return {
        orderItemId: orderItem.id,
        quantity: item.quantity,
        reason: item.reason ?? '',
        conditionNotes: item.conditionNotes ?? null,
      }
    }),
  )

  const returnRequest = await prisma.$transaction(async tx => {
    const created = await tx.returnRequest.create({
      data: {
        merchantId,
        orderId,
        customerId: input.customerId ?? order.customerId ?? null,
        returnNumber,
        status: 'requested',
        reason: input.reason ?? '',
        customerComment: input.customerComment ?? null,
        requestedAt: new Date(),
        items: { create: rows },
      },
    })

    await tx.orderStatusHistory.create({
      data: {
        merchantId,
        orderId,
        previousStatus: null,
        newStatus: 'requested',
        statusType: 'order',
        changedByUserId: actorUserId,
        changedByType: actorUserId ? 'merchant' : 'system',
        changeReason: `Return request ${returnNumber} created`,
      },
    })

    await logAudit({
      merchantId,
      actorUserId,
      action: 'return_request_created',
      entityType: 'return_request',
      entityId: created.id,
      metadata: { return_number: returnNumber, order_id: orderId, items: rows.length },
    })

    return created
  })

  return prisma.returnRequest.findUnique({ where: { id: returnRequest.id }, include: { items: true, order: { select: { orderNumber: true } } } })
}

export async function getReturn(merchantId: string, returnId: string) {
  return prisma.returnRequest.findFirst({
    where: { id: returnId, merchantId },
    include: {
      items: { include: { orderItem: { include: { product: true } } } },
      order: {
        select: {
          id: true,
          orderNumber: true,
          totalAmount: true,
          paidAt: true,
          customer: { select: { id: true, fullName: true, phone: true, email: true } },
        },
      },
      refunds: true,
    },
  })
}

export async function listReturns(
  merchantId: string,
  filters: { status?: string | null; from?: Date | null; to?: Date | null; q?: string | null; limit?: number; offset?: number } = {},
) {
  const limit = Math.min(filters.limit ?? 50, 200)
  const where: Record<string, unknown> = { merchantId }
  if (filters.status) where.status = filters.status
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    }
  }
  const [returns, total] = await prisma.$transaction([
    prisma.returnRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: filters.offset ?? 0,
      include: {
        order: { select: { id: true, orderNumber: true, totalAmount: true } },
        items: { select: { quantity: true } },
        refunds: { select: { id: true, status: true, amount: true } },
      },
    }),
    prisma.returnRequest.count({ where }),
  ])
  return { returns, total, limit }
}

/** Central status transition with validation + history + audit. */
export async function transitionReturn(params: {
  merchantId: string
  returnId: string
  to: string
  note?: string | null
  actorUserId?: string | null
}) {
  const { merchantId, returnId, to, note = null, actorUserId = null } = params

  return prisma.$transaction(async tx => {
    const ret = await tx.returnRequest.findFirst({ where: { id: returnId, merchantId } })
    if (!ret) throw new Error('Return request not found')
    if (!canTransitionReturn(ret.status, to)) {
      throw new Error(`Cannot move return from '${ret.status}' to '${to}'`)
    }

    const data: Record<string, unknown> = {
      status: to,
      merchantNote: note ?? ret.merchantNote,
    }
    if (to === 'approved') data.approvedAt = new Date()
    if (to === 'returned_to_merchant') data.receivedAt = new Date()
    if (to === 'closed') data.closedAt = new Date()

    const updated = await tx.returnRequest.update({ where: { id: ret.id }, data })

    await tx.orderStatusHistory.create({
      data: {
        merchantId,
        orderId: ret.orderId,
        previousStatus: ret.status,
        newStatus: to,
        statusType: 'order',
        changedByUserId: actorUserId,
        changedByType: 'merchant',
        changeReason: note ?? `Return ${to}`,
      },
    })

    await logAudit({
      merchantId,
      actorUserId,
      action: 'return_status_changed',
      entityType: 'return_request',
      entityId: ret.id,
      metadata: { from: ret.status, to, return_number: ret.returnNumber },
    })

    // When items are physically received, mark them as returned so the order
    // item quantities stay accurate.
    if (to === 'returned_to_merchant') {
      const items = await tx.returnItem.findMany({ where: { returnId: ret.id } })
      for (const item of items) {
        const orderItem = await tx.orderItem.findUnique({ where: { id: item.orderItemId } })
        if (orderItem) {
          await tx.orderItem.update({
            where: { id: orderItem.id },
            data: { quantityReturned: orderItem.quantityReturned + item.quantity },
          })
        }
      }
    }

    return updated
  })
}

export async function approveReturn(params: { merchantId: string; returnId: string; note?: string | null; actorUserId?: string | null }) {
  const updated = await transitionReturn({ ...params, to: 'approved' })
  // Restore stock on approval when the merchant setting allows it.
  await restoreStockForReturnItems({ merchantId: params.merchantId, returnId: params.returnId, reason: `Return ${updated.returnNumber} approved` })
  await triggerMessageAutomations({
    merchantId: params.merchantId,
    eventType: 'return_approved',
    idempotencyKey: `return_${params.returnId}_approved`,
    to: '',
    orderId: updated.orderId,
  }).catch(() => {})
  return updated
}

export async function rejectReturn(params: { merchantId: string; returnId: string; note?: string | null; actorUserId?: string | null }) {
  return transitionReturn({ ...params, to: 'rejected' })
}

export async function scheduleReturnPickup(params: { merchantId: string; returnId: string; note?: string | null; actorUserId?: string | null }) {
  return transitionReturn({ ...params, to: 'return_pickup_scheduled' })
}

export async function markReturnInTransit(params: { merchantId: string; returnId: string; note?: string | null; actorUserId?: string | null }) {
  return transitionReturn({ ...params, to: 'return_in_transit' })
}

export async function markReturnReceived(params: { merchantId: string; returnId: string; note?: string | null; actorUserId?: string | null }) {
  const updated = await transitionReturn({ ...params, to: 'returned_to_merchant' })
  await triggerMessageAutomations({
    merchantId: params.merchantId,
    eventType: 'return_received',
    idempotencyKey: `return_${params.returnId}_received`,
    to: '',
    orderId: updated.orderId,
  }).catch(() => {})
  return updated
}

export async function closeReturn(params: { merchantId: string; returnId: string; note?: string | null; actorUserId?: string | null }) {
  return transitionReturn({ ...params, to: 'closed' })
}