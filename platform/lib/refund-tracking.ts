import { Prisma, RefundStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { generateOrderNumber } from '@/lib/status'
import { sendMessage, type ChannelDispatchResult } from '@/lib/messaging/engine'
import { buildMessageContext } from '@/lib/messaging/events'
import { getChannelCredentials } from '@/lib/messaging/connections'
import { isOpenWaConfigured } from '@/lib/messaging/openwa'

/**
 * Manual refund tracking.
 *
 * UPI refunds happen in the merchant's own UPI app. ToroPay only records what
 * they promised to refund and when they mark it as sent. Nothing in this file
 * talks to a payment provider.
 */

export type RefundDisplayStatus = 'pending' | 'processed' | 'failed'

/** The status a merchant and customer see, regardless of the stored enum. */
export function refundDisplayStatus(status: string): RefundDisplayStatus {
  if (status === RefundStatus.processed || status === RefundStatus.completed) return 'processed'
  if (status === RefundStatus.failed) return 'failed'
  return 'pending'
}

const PROCESSED_STATUSES: RefundStatus[] = [RefundStatus.processed, RefundStatus.completed]
const PENDING_STATUSES: RefundStatus[] = [RefundStatus.pending, RefundStatus.initiated]

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function isMissingRefundTable(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err.code === 'P2021' || err.code === 'P2022')
  )
}

export const refundInclude = Prisma.validator<Prisma.RefundInclude>()({
  order: {
    select: {
      id: true,
      orderNumber: true,
      totalAmount: true,
      currency: true,
      customer: { select: { fullName: true, email: true, phone: true } },
    },
  },
  payment: {
    select: { id: true, paymentReference: true, provider: true, status: true },
  },
  transaction: {
    select: {
      id: true,
      txnId: true,
      customerName: true,
      customerEmail: true,
      customerPhone: true,
      status: true,
    },
  },
})

export type RefundRow = Prisma.RefundGetPayload<{ include: typeof refundInclude }>

export function serializeRefund(refund: RefundRow) {
  return {
    id: refund.id,
    merchant_id: refund.merchantId,
    refund_number: refund.refundNumber,
    order_id: refund.orderId,
    order_number: refund.order?.orderNumber ?? null,
    transaction_id: refund.transactionId,
    transaction_ref: refund.transaction?.txnId ?? null,
    payment_id: refund.paymentId,
    amount: refund.amount.toNumber(),
    currency: refund.currency,
    reason: refund.reason,
    status: refundDisplayStatus(refund.status),
    customer_name:
      refund.order?.customer?.fullName ??
      refund.transaction?.customerName ??
      null,
    customer_email:
      refund.order?.customer?.email ??
      refund.transaction?.customerEmail ??
      null,
    customer_phone:
      refund.order?.customer?.phone ??
      refund.transaction?.customerPhone ??
      null,
    created_at: refund.createdAt.toISOString(),
    processed_at: refund.completedAt?.toISOString() ?? null,
  }
}

async function nextRefundNumber(merchantId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const number = generateOrderNumber().replace('TP', 'REF')
    const exists = await prisma.refund.findFirst({
      where: { merchantId, refundNumber: number },
      select: { id: true },
    })
    if (!exists) return number
  }
  throw new Error('Unable to generate a refund number. Please try again.')
}

export interface CreateManualRefundInput {
  merchantId: string
  orderId?: string | null
  transactionId?: string | null
  amount: number
  reason?: string | null
  actorUserId?: string | null
}

/**
 * Record a refund against an order, a payment-link transaction, or both.
 * The amount is checked against what has already been recorded, so a merchant
 * cannot mark more money refunded than the customer actually paid.
 */
export async function createManualRefund(input: CreateManualRefundInput) {
  const { merchantId, amount, actorUserId = null } = input
  const orderId = input.orderId?.trim() || null
  const transactionLookup = input.transactionId?.trim() || null

  if (!orderId && !transactionLookup) {
    throw new Error('Choose an order or a transaction to refund')
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Refund amount must be greater than zero')
  }

  const order = orderId
    ? await prisma.order.findFirst({
        where: { id: orderId, merchantId },
        include: {
          customer: { select: { fullName: true, email: true, phone: true } },
          payments: {
            where: { status: { in: ['paid', 'partially_refunded', 'refunded'] } },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, currency: true, status: true },
          },
        },
      })
    : null
  if (orderId && !order) throw new Error('Order not found')
  if (order && !['paid', 'partially_refunded', 'refunded'].includes(order.paymentStatus)) {
    throw new Error('Only a paid order can be refunded')
  }

  const transaction = transactionLookup
    ? await prisma.transaction.findFirst({
        where: {
          merchantId,
          OR: [{ id: transactionLookup }, { txnId: transactionLookup }],
        },
        select: {
          id: true,
          txnId: true,
          amount: true,
          status: true,
          customerName: true,
          customerEmail: true,
          customerPhone: true,
        },
      })
    : null
  if (transactionLookup && !transaction) throw new Error('Transaction not found')
  if (transaction && transaction.status !== 'success') {
    throw new Error('Only a payment received from the customer can be refunded')
  }

  const sourceAmount = order
    ? order.totalAmount.toNumber()
    : transaction!.amount
  if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) {
    throw new Error('There is no paid amount to refund')
  }

  // A refund record can point at an order, a transaction, or both. Count every
  // non-failed record that belongs to either one so a second refund cannot
  // push the total past what the customer paid.
  const scope: Prisma.RefundWhereInput = order
    ? {
        OR: [
          { orderId: order.id },
          ...(transaction ? [{ transactionId: transaction.id }] : []),
        ],
      }
    : { transactionId: transaction!.id }

  const existing = await prisma.refund.findMany({
    where: {
      merchantId,
      ...scope,
      status: { not: RefundStatus.failed },
    },
    select: { amount: true },
  })
  const committed = existing.reduce((sum, row) => sum + row.amount.toNumber(), 0)
  const remaining = round2(sourceAmount - committed)

  const refundAmount = round2(Number(amount))
  if (refundAmount < 0.01) {
    throw new Error('Refund amount must be at least 0.01')
  }
  if (refundAmount > remaining) {
    throw new Error(
      remaining > 0
        ? `Refund cannot exceed the remaining ${remaining.toFixed(2)} for this payment`
        : 'This payment has already been fully refunded',
    )
  }

  const refundNumber = await nextRefundNumber(merchantId)
  const refund = await prisma.refund.create({
    data: {
      merchantId,
      orderId: order?.id ?? null,
      paymentId: order?.payments[0]?.id ?? null,
      transactionId: transaction?.id ?? null,
      refundNumber,
      amount: new Prisma.Decimal(refundAmount),
      currency: order?.currency ?? order?.payments[0]?.currency ?? 'INR',
      status: RefundStatus.pending,
      reason: input.reason?.trim() || null,
    },
    include: refundInclude,
  })

  await logAudit({
    merchantId,
    actorUserId,
    action: 'refund_created',
    entityType: 'refund',
    entityId: refund.id,
    metadata: {
      refund_number: refund.refundNumber,
      amount: refundAmount,
      order_id: refund.orderId,
      transaction_id: refund.transactionId,
    },
  }).catch(() => {})

  return serializeRefund(refund)
}

export interface ListManualRefundsOptions {
  status?: string | null
  limit?: number
}

/** The merchant's refund records, newest first, plus totals for the cards. */
export async function listManualRefunds(merchantId: string, options: ListManualRefundsOptions = {}) {
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500)
  const status = options.status?.trim().toLowerCase() || null

  const where: Prisma.RefundWhereInput = { merchantId }
  if (status === 'pending') where.status = { in: PENDING_STATUSES }
  else if (status === 'processed') where.status = { in: PROCESSED_STATUSES }
  else if (status === 'failed') where.status = RefundStatus.failed

  const [rows, pending, processed] = await Promise.all([
    prisma.refund.findMany({
      where,
      include: refundInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    }),
    prisma.refund.aggregate({
      where: { merchantId, status: { in: PENDING_STATUSES } },
      _sum: { amount: true },
    }),
    prisma.refund.aggregate({
      where: { merchantId, status: { in: PROCESSED_STATUSES } },
      _sum: { amount: true },
    }),
  ])

  return {
    refunds: rows.map(serializeRefund),
    total_pending: round2(pending._sum.amount?.toNumber() ?? 0),
    total_processed: round2(processed._sum.amount?.toNumber() ?? 0),
  }
}

interface RefundNotificationContext {
  merchantId: string
  refund: RefundRow
}

async function notifyRefundProcessed({ merchantId, refund }: RefundNotificationContext): Promise<ChannelDispatchResult[]> {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { businessName: true, supportEmail: true, supportPhone: true },
  })

  const email = refund.order?.customer?.email ?? refund.transaction?.customerEmail ?? null
  const phone = refund.order?.customer?.phone ?? refund.transaction?.customerPhone ?? null
  const customerName =
    refund.order?.customer?.fullName ??
    refund.transaction?.customerName ??
    'Customer'
  const reference = refund.order?.orderNumber ?? refund.transaction?.txnId ?? refund.refundNumber

  if (!email && !phone) return []

  const context = buildMessageContext({
    customer_name: customerName,
    business_name: merchant?.businessName || 'ToroPay business',
    order_number: reference,
    order_id: refund.orderId ?? refund.transactionId ?? refund.refundNumber,
    amount: refund.amount.toNumber().toFixed(2),
    currency: refund.currency,
    support_email: merchant?.supportEmail || '',
    support_phone: merchant?.supportPhone || '',
  })

  const targets: Array<{ channel: 'email' | 'whatsapp'; to: string }> = []
  if (email) targets.push({ channel: 'email', to: email })

  if (phone) {
    // Only try WhatsApp when the merchant has actually connected a sender.
    // Otherwise the message would sit in the log as a failed delivery.
    const saved = await getChannelCredentials(merchantId, 'whatsapp').catch(() => ({ credentials: null }))
    if (saved.credentials || isOpenWaConfigured()) {
      targets.push({ channel: 'whatsapp', to: phone })
    }
  }

  const results = await Promise.all(
    targets.map(async target => {
      try {
        return await sendMessage({
          merchantId,
          channel: target.channel,
          eventType: 'refund_completed',
          to: target.to,
          context,
          idempotencyKey: `refund_${refund.id}_processed_${target.channel}`,
          orderId: refund.orderId,
        })
      } catch {
        return { channel: target.channel, status: 'failed' as const }
      }
    }),
  )

  return results
}

/**
 * Mark a pending refund as processed after the merchant has sent the money.
 * Customers are notified by email, and by WhatsApp when the merchant has a
 * WhatsApp sender connected. Notification failures never undo the update.
 */
export async function markRefundProcessed(params: {
  merchantId: string
  refundId: string
  actorUserId?: string | null
}) {
  const { merchantId, refundId, actorUserId = null } = params
  const existing = await prisma.refund.findFirst({
    where: { id: refundId, merchantId },
    include: refundInclude,
  })
  if (!existing) throw new Error('Refund not found')

  if (refundDisplayStatus(existing.status) === 'processed') {
    return { refund: serializeRefund(existing), notifications: [] as ChannelDispatchResult[] }
  }
  if (existing.status === RefundStatus.failed) {
    throw new Error('A failed refund cannot be marked as processed')
  }

  const updated = await prisma.refund.update({
    where: { id: existing.id },
    data: {
      status: RefundStatus.processed,
      completedAt: new Date(),
      failureReason: null,
    },
    include: refundInclude,
  })

  await logAudit({
    merchantId,
    actorUserId,
    action: 'refund_processed',
    entityType: 'refund',
    entityId: updated.id,
    metadata: {
      refund_number: updated.refundNumber,
      amount: updated.amount.toNumber(),
      order_id: updated.orderId,
      transaction_id: updated.transactionId,
    },
  }).catch(() => {})

  const notifications = await notifyRefundProcessed({ merchantId, refund: updated }).catch(() => [])
  return { refund: serializeRefund(updated), notifications }
}

export interface PublicRefundSummary {
  refunds: Array<{
    id: string
    amount: number
    status: RefundDisplayStatus
    created_at: string
    processed_at: string | null
  }>
  total_amount: number
  pending_amount: number
  processed_amount: number
}

async function publicRefundSummary(where: Prisma.RefundWhereInput): Promise<PublicRefundSummary | null> {
  try {
    const rows = await prisma.refund.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: { id: true, amount: true, status: true, createdAt: true, completedAt: true },
    })
    const refunds = rows.map(row => ({
      id: row.id,
      amount: row.amount.toNumber(),
      status: refundDisplayStatus(row.status),
      created_at: row.createdAt.toISOString(),
      processed_at: row.completedAt?.toISOString() ?? null,
    }))
    return {
      refunds,
      total_amount: round2(refunds.reduce((sum, row) => sum + row.amount, 0)),
      pending_amount: round2(
        refunds.filter(row => row.status === 'pending').reduce((sum, row) => sum + row.amount, 0),
      ),
      processed_amount: round2(
        refunds.filter(row => row.status === 'processed').reduce((sum, row) => sum + row.amount, 0),
      ),
    }
  } catch (err) {
    // A payment page must keep working during the window between deploying
    // this code and running the refunds migration.
    if (isMissingRefundTable(err)) return null
    throw err
  }
}

/** What a customer should see on their payment page for one transaction. */
export async function publicRefundSummaryForTransaction(transactionId: string) {
  return publicRefundSummary({ transactionId })
}

/** What a customer should see on the checkout success page for one order. */
export async function publicRefundSummaryForOrder(orderId: string) {
  return publicRefundSummary({ orderId })
}
