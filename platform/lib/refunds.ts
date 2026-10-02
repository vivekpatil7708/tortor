import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { Prisma } from '@prisma/client'
import { getProvider } from '@/lib/payments'
import { generateOrderNumber } from '@/lib/status'
import { transitionReturn } from './returns'
import { triggerMessageAutomations } from '@/lib/messaging/engine'

export interface RefundDetail {
  id: string
  merchantId: string
  orderId: string
  paymentId: string
  returnId: string | null
  refundNumber: string
  amount: number
  currency: string
  status: 'pending' | 'initiated' | 'completed' | 'failed'
  providerRefundId: string | null
  failureReason: string | null
  reason: string | null
  initiatedAt: Date | null
  completedAt: Date | null
  createdAt: Date
}

function generateRefundNumber(): string {
  return generateOrderNumber().replace('TP', 'REF')
}

/** Sum of all non-failed refunds for a payment (what is already committed). */
export async function committedRefundAmount(paymentId: string): Promise<number> {
  const rows = await prisma.refund.findMany({
    where: { paymentId, status: { not: 'failed' } },
    select: { amount: true },
  })
  return rows.reduce((sum, r) => sum + r.amount.toNumber(), 0)
}

/**
 * Remaining refundable amount for a payment = payment amount − committed
 * refunds. Refunds can never exceed the original payment amount.
 */
export async function getRefundableAmount(paymentId: string): Promise<number> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } })
  if (!payment) return 0
  const committed = await committedRefundAmount(paymentId)
  return Math.max(0, Math.round((payment.amount.toNumber() - committed) * 100) / 100)
}

export interface CreateRefundInput {
  merchantId: string
  orderId: string
  paymentId: string
  returnId?: string | null
  amount: number
  reason?: string | null
  actorUserId?: string | null
}

/**
 * Create a refund record (status pending). Amount rules: positive, within the
 * payment amount, and must not push committed refunds past the payment.
 */
export async function createRefund(input: CreateRefundInput) {
  const { merchantId, orderId, paymentId, actorUserId = null } = input

  const payment = await prisma.payment.findFirst({ where: { id: paymentId, merchantId, orderId } })
  if (!payment) throw new Error('Payment not found for this order & merchant')
  if (!['paid', 'partially_refunded', 'refunded'].includes(payment.status)) {
    throw new Error(`Payments in '${payment.status}' state cannot be refunded`)
  }

  const amount = Math.round(Number(input.amount) * 100) / 100
  if (amount <= 0) throw new Error('Refund amount must be greater than zero')

  const refundable = await getRefundableAmount(paymentId)
  if (amount > refundable) {
    throw new Error(`Refund of ${amount} exceeds the refundable amount ${refundable} for this payment`)
  }

  let refundNumber = ''
  for (let attempt = 0; attempt < 5; attempt++) {
    refundNumber = generateRefundNumber()
    const exists = await prisma.refund.findFirst({ where: { merchantId, refundNumber } })
    if (!exists) break
  }
  if (!refundNumber) throw new Error('Unable to generate a unique refund number, try again')

  // Validate target return linkage (optional).
  if (input.returnId) {
    const ret = await prisma.returnRequest.findFirst({ where: { id: input.returnId, merchantId, orderId } })
    if (!ret) throw new Error('Return not found for this order')
  }

  const refund = await prisma.$transaction(async tx => {
    const created = await tx.refund.create({
      data: {
        merchantId,
        orderId,
        paymentId,
        returnId: input.returnId ?? null,
        refundNumber,
        amount: new Prisma.Decimal(amount),
        currency: payment.currency,
        status: 'pending',
        reason: input.reason ?? null,
      },
    })
    await logAudit({
      merchantId,
      actorUserId,
      action: 'refund_created',
      entityType: 'refund',
      entityId: created.id,
      metadata: { refund_number: refundNumber, amount, order_id: orderId },
    })
    return created
  })

  return prisma.refund.findUnique({ where: { id: refund.id } })
}

/** Send the refund to the payment provider. Only pending (or failed) refunds. */
export async function initiateRefund(params: { merchantId: string; refundId: string; actorUserId?: string | null }) {
  const { merchantId, refundId, actorUserId = null } = params
  const refund = await prisma.refund.findFirst({
    where: { id: refundId, merchantId },
    include: { payment: true, order: true },
  })
  if (!refund) throw new Error('Refund not found')
  if (refund.status === 'completed') throw new Error('Refund is already completed')
  if (refund.status === 'initiated') throw new Error('Refund is already initiated (waiting for provider confirmation)')

  const adapter = getProvider(refund.payment.provider as 'mock' | 'upi' | 'razorpay' | 'cashfree')
  const providerPaymentId = refund.payment.providerPaymentId
  if (!providerPaymentId) {
    await markRefundFailed({ merchantId, refundId, reason: 'Payment has no provider reference to refund' })
    throw new Error('Payment has no provider reference to refund')
  }

  const result = await adapter.refundPayment({
    paymentId: providerPaymentId,
    amount: refund.amount.toNumber(),
    reason: refund.reason ?? undefined,
  })

  if (!result.success) {
    await markRefundFailed({ merchantId, refundId, reason: result.error ?? 'Provider rejected the refund' })
    return { refund: { ...refund }, status: 'failed', error: result.error }
  }

  const updated = await prisma.refund.update({
    where: { id: refund.id },
    data: {
      status: 'initiated',
      providerRefundId: result.providerRefundId ?? null,
      initiatedAt: new Date(),
    },
  })

  // Push the return (if any) to refund_initiated when its items are received.
  if (refund.returnId) {
    await transitionReturn({
      merchantId,
      returnId: refund.returnId,
      to: 'refund_initiated',
      note: `Refund ${refund.refundNumber} initiated`,
    }).catch(() => {})
  }

  await logAudit({
    merchantId,
    actorUserId,
    action: 'refund_initiated',
    entityType: 'refund',
    entityId: refund.id,
    metadata: { refund_number: refund.refundNumber, provider: refund.payment.provider },
  })

  await triggerMessageAutomations({
    merchantId,
    eventType: 'refund_initiated',
    idempotencyKey: `refund_${refund.id}_initiated`,
    to: '',
    orderId: refund.orderId,
  }).catch(() => {})

  return { refund: updated, status: 'initiated' }
}

export async function markRefundFailed(params: { merchantId: string; refundId: string; reason: string }) {
  const refund = await prisma.refund.findFirst({ where: { id: params.refundId, merchantId: params.merchantId } })
  if (!refund) throw new Error('Refund not found')
  return prisma.refund.update({
    where: { id: refund.id },
    data: { status: 'failed', failureReason: params.reason },
  })
}

/** Heuristic to pull a provider refund id out of a webhook payload. */
export function extractProviderRefundId(provider: string, payload: Record<string, unknown>): string | null {
  if (provider === 'mock') {
    const rid = payload.refund_id
    return typeof rid === 'string' ? rid : null
  }
  if (provider === 'razorpay') {
    const event = String(payload.event ?? '')
    const entity = payload.entity as Record<string, unknown> | undefined
    if (event.includes('refund') && entity && typeof entity.id === 'string') {
      return entity.id
    }
    // refund.created carries the refund in `entity`.
    const nonRefundEntity = payload.payment as Record<string, unknown> | undefined
    if (nonRefundEntity && typeof nonRefundEntity.id === 'string') return String(nonRefundEntity.id)
    return null
  }
  return null
}

/**
 * Provider-confirmed completion (source of truth). The payment-provider
 * webhook already updated Payment.status; this finalizes our Refund row,
 * return, audit and customer notification.
 */
export async function completeRefundFromProviderWebhook(params: {
  merchantId: string
  paymentId: string
  providerRefundId?: string | null
  amount?: number | null
}) {
  const { merchantId, paymentId, providerRefundId, amount } = params
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, merchantId } })
  if (!payment) return { ok: false, reason: 'Payment not found' }

  const refunds = await prisma.refund.findMany({
    where: { merchantId, paymentId, status: { in: ['pending', 'initiated'] } },
    orderBy: { createdAt: 'asc' },
  })
  if (!refunds.length) return { ok: false, reason: 'No pending refund to complete' }

  const target = providerRefundId
    ? refunds.find(r => r.providerRefundId === providerRefundId)
    : undefined

  let matched: typeof refunds[number] | undefined = providerRefundId && target ? target : refunds[0]
  if (providerRefundId && !target) {
    // Provider refund id we don't recognise — attach to the oldest eligible.
    matched = refunds[0]
  }
  if (!matched) return { ok: false, reason: 'No pending refund to complete' }

  const completed = await prisma.refund.update({
    where: { id: matched.id },
    data: {
      status: 'completed',
      providerRefundId: providerRefundId ?? matched.providerRefundId,
      completedAt: new Date(),
      failureReason: null,
    },
  })

  if (matched.returnId) {
    await transitionReturn({
      merchantId,
      returnId: matched.returnId,
      to: 'refunded',
      note: `Refund ${completed.refundNumber} confirmed by provider`,
    }).catch(() => {})
  }

  await logAudit({
    merchantId,
    actorUserId: null,
    action: 'refund_completed',
    entityType: 'refund',
    entityId: matched.id,
    metadata: { refund_number: completed.refundNumber, provider_refund_id: providerRefundId, amount: amount ?? null },
  })

  await triggerMessageAutomations({
    merchantId,
    eventType: 'refund_completed',
    idempotencyKey: `refund_${matched.id}_completed`,
    to: '',
    orderId: matched.orderId,
  }).catch(() => {})

  return { ok: true, refund: completed }
}

export async function listRefunds(
  merchantId: string,
  filters: { status?: string | null; from?: Date | null; to?: Date | null; limit?: number; offset?: number } = {},
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
  const [refunds, total] = await prisma.$transaction([
    prisma.refund.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: filters.offset ?? 0,
      include: {
        order: { select: { id: true, orderNumber: true } },
        payment: { select: { id: true, provider: true, status: true, currency: true } },
        returnRequest: { select: { id: true, returnNumber: true, status: true } },
      },
    }),
    prisma.refund.count({ where }),
  ])
  return { refunds, total, limit }
}

export async function getRefund(merchantId: string, refundId: string) {
  return prisma.refund.findFirst({
    where: { id: refundId, merchantId },
    include: {
      order: { select: { id: true, orderNumber: true, totalAmount: true, paidAt: true } },
      payment: true,
      returnRequest: { include: { items: true } },
    },
  })
}