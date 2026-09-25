import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export interface CreateFollowUpInput {
  merchantId: string
  customerId?: string | null
  orderId?: string | null
  assignedUserId?: string | null
  category?: string
  title: string
  notes?: string | null
  dueAt?: Date | null
}

export async function createFollowUpTask(input: CreateFollowUpInput) {
  const task = await prisma.followUpTask.create({
    data: {
      merchantId: input.merchantId,
      customerId: input.customerId ?? null,
      orderId: input.orderId ?? null,
      assignedUserId: input.assignedUserId ?? null,
      category: input.category ?? 'general',
      title: input.title,
      notes: input.notes ?? null,
      dueAt: input.dueAt ?? new Date(),
    },
  })
  await logAudit({
    merchantId: input.merchantId,
    actorUserId: null,
    action: 'follow_up_created',
    entityType: 'follow_up_task',
    entityId: task.id,
    metadata: { category: input.category, order_id: input.orderId, customer_id: input.customerId },
  })
  return task
}

export async function updateFollowUpTask(merchantId: string, taskId: string, patch: { status?: string; assignedUserId?: string | null; notes?: string | null }) {
  const existing = await prisma.followUpTask.findFirst({ where: { id: taskId, merchantId } })
  if (!existing) throw new Error('Follow-up task not found')

  const data: Record<string, unknown> = {}
  if (patch.status !== undefined) {
    data.status = patch.status
    data.completedAt = patch.status === 'completed' ? new Date() : patch.status === 'dismissed' ? new Date() : null
  }
  if (patch.assignedUserId !== undefined) data.assignedUserId = patch.assignedUserId
  if (patch.notes !== undefined) data.notes = patch.notes

  const task = await prisma.followUpTask.update({ where: { id: taskId }, data })
  await logAudit({
    merchantId,
    actorUserId: null,
    action: 'follow_up_updated',
    entityType: 'follow_up_task',
    entityId: taskId,
    metadata: { status: patch.status, notes: patch.notes },
  })
  return task
}

export async function listFollowUpTasks(
  merchantId: string,
  filters: { status?: string | null; category?: string | null; from?: Date | null; to?: Date | null; limit?: number; offset?: number } = {},
) {
  const limit = Math.min(filters.limit ?? 50, 200)
  const where: Record<string, unknown> = { merchantId }
  if (filters.status) where.status = filters.status
  if (filters.category) where.category = filters.category
  if (filters.from || filters.to) {
    where.dueAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    }
  }
  const [tasks, total] = await prisma.$transaction([
    prisma.followUpTask.findMany({
      where,
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
      take: limit,
      skip: filters.offset ?? 0,
      include: { customer: { select: { id: true, fullName: true, email: true, phone: true } }, order: { select: { id: true, orderNumber: true, totalAmount: true } } },
    }),
    prisma.followUpTask.count({ where }),
  ])
  return { tasks, total, limit }
}

// =============================================================================
// SUGGESTIONS
// =============================================================================

export interface FollowUpSuggestion {
  category: string
  title: string
  customerId?: string | null
  orderId?: string | null
  orderNumber?: string | null
  reference?: string | null
  detail: string
  dueAt: Date
}

const HOURS_24 = 24 * 60 * 60 * 1000
const HOURS_48 = 48 * 60 * 60 * 1000

/**
 * Compute follow-up suggestions for a merchant. Each suggestion is deduped
 * against existing open tasks so a suggestion is not offered twice.
 */
export async function suggestFollowUps(merchantId: string, now = new Date()): Promise<FollowUpSuggestion[]> {
  const suggestions: FollowUpSuggestion[] = []
  const openTasks = await prisma.followUpTask.findMany({
    where: { merchantId, status: 'open' },
    select: { category: true, customerId: true, orderId: true },
  })
  const seen = new Set(openTasks.map(t => `${t.category}:${t.orderId ?? t.customerId ?? ''}`))
  const hasOpen = (category: string, orderId?: string | null, customerId?: string | null) =>
    seen.has(`${category}:${orderId ?? customerId ?? ''}`)

  // 1. Pending payments older than 24h.
  const pendingCutoff = new Date(now.getTime() - HOURS_24)
  const pendingOrders = await prisma.order.findMany({
    where: {
      merchantId,
      orderStatus: 'pending_payment',
      paymentStatus: { in: ['pending', 'processing', 'expired'] },
      createdAt: { lte: pendingCutoff },
    },
    include: { customer: true, payments: { select: { id: true } } },
    take: 100,
  })
  for (const order of pendingOrders) {
    if (hasOpen('payment_pending', order.id)) continue
    suggestions.push({
      category: 'payment_pending',
      title: `Payment pending — ${order.orderNumber}`,
      customerId: order.customerId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      reference: order.customer?.fullName ?? undefined,
      detail: `Awaiting payment for ${Math.floor((now.getTime() - order.createdAt.getTime()) / HOURS_24)} day(s).`,
      dueAt: now,
    })
  }

  // 2. Delivery failures needing attention.
  const failedPackages = await prisma.shipmentEvent.findMany({
    where: { merchantId, eventStatus: 'delivery_failed' },
    distinct: ['packageId'],
    orderBy: { eventAt: 'desc' },
    take: 200,
    include: {
      package: { include: { fulfillment: { include: { order: { include: { customer: true } } } } } },
    },
  })
  for (const ev of failedPackages) {
    const order = ev.package?.fulfillment?.order
    if (!order) continue
    if (now.getTime() - ev.eventAt.getTime() > 5 * HOURS_48) continue
    if (hasOpen('delivery_failed', order.id)) continue
    suggestions.push({
      category: 'delivery_failed',
      title: `Delivery failed — ${order.orderNumber}`,
      customerId: order.customerId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      reference: order.customer?.fullName ?? undefined,
      detail: `Package ${ev.package?.trackingNumber ?? ev.package?.awbNumber ?? ''} failed delivery. Contact the customer to re-deliver.`,
      dueAt: now,
    })
  }

  // 3. Delivered orders (48h-30d ago) without a review follow-up.
  const reviewFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const reviewUntil = new Date(now.getTime() - HOURS_48)
  const deliveredOrders = await prisma.order.findMany({
    where: {
      merchantId,
      fulfillmentSummaryStatus: { in: ['delivered', 'partially_delivered'] },
      paidAt: { gte: reviewFrom, lte: reviewUntil },
    },
    include: { customer: true, payments: { select: { id: true } } },
    take: 100,
  })
  for (const order of deliveredOrders) {
    if (hasOpen('review_request', order.id)) continue
    suggestions.push({
      category: 'review_request',
      title: `Request a review — ${order.orderNumber}`,
      customerId: order.customerId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      reference: order.customer?.fullName ?? undefined,
      detail: `Order delivered; ask this customer for feedback.`,
      dueAt: now,
    })
  }

  // 4. High-value customers who haven't reordered in 30–90 days.
  const reorderFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
  const reorderUntil = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const dormantVip = await prisma.customer.findMany({
    where: {
      merchantId,
      totalSpent: { gte: 10000 },
      lastOrderAt: { gte: reorderFrom, lte: reorderUntil },
    },
    take: 100,
  })
  for (const customer of dormantVip) {
    if (hasOpen('repeat_customer', null, customer.id)) continue
    suggestions.push({
      category: 'repeat_customer',
      title: `Win-back ${customer.fullName}`,
      customerId: customer.id,
      reference: customer.fullName,
      detail: `High-value customer (₹${customer.totalSpent.toLocaleString('en-IN')}) — no order in 30+ days.`,
      dueAt: now,
    })
  }

  // 5. Return/refund requests that need a merchant response after 48h.
  const returnCutoff = new Date(now.getTime() - HOURS_48)
  const staleReturns = await prisma.returnRequest.findMany({
    where: { merchantId, status: { in: ['requested', 'rejected'] }, createdAt: { lte: returnCutoff } },
    include: { order: { select: { orderNumber: true } } },
    take: 100,
  })
  for (const ret of staleReturns) {
    if (hasOpen('return_response', ret.orderId)) continue
    suggestions.push({
      category: 'return_response',
      title: `Respond to return — ${ret.order.orderNumber}`,
      customerId: ret.customerId,
      orderId: ret.orderId,
      orderNumber: ret.order.orderNumber,
      reference: ret.returnNumber,
      detail: `Return request (${ret.status}) awaiting your response for 48+ hours.`,
      dueAt: now,
    })
  }

  return suggestions.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
}

/** Convert a suggestion into a persisted task (idempotent for open tasks). */
export async function createFollowUpFromSuggestion(merchantId: string, suggestion: FollowUpSuggestion) {
  const existing = await prisma.followUpTask.findFirst({
    where: {
      merchantId,
      category: suggestion.category,
      status: 'open',
      ...(suggestion.orderId ? { orderId: suggestion.orderId } : {}),
      ...(suggestion.customerId ? { customerId: suggestion.customerId } : {}),
    },
    select: { id: true },
  })
  if (existing) return { task: existing, created: false }
  const task = await createFollowUpTask({
    merchantId,
    customerId: suggestion.customerId ?? null,
    orderId: suggestion.orderId ?? null,
    category: suggestion.category,
    title: suggestion.title,
    notes: suggestion.detail,
    dueAt: suggestion.dueAt,
  })
  return { task, created: true }
}