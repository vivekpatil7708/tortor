import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getProvider } from '@/lib/payments'
import { logAudit } from '@/lib/audit'
import { dispatchMerchantWebhook } from '@/lib/webhook-delivery'
import { sendAutomatedEmail, buildEmailContextFromCheckout } from '@/lib/emails/service'
import { TOROPAY_PUBLIC_URL } from '@/lib/checkout'
import { completeRefundFromProviderWebhook, extractProviderRefundId } from '@/lib/refunds'
import { applyInventoryDeductionOnMode } from '@/lib/inventory'
import type { KeyMode, PaymentStatus } from '@prisma/client'

export interface NormalizedProviderEvent {
  providerEventId: string
  eventType: string
  paymentId?: string | null
  orderId?: string | null
  paymentRef?: string | null
  amount?: number | null
  currency?: string | null
}

export function sha256(payload: string): string {
  return crypto.createHash('sha256').update(payload).digest('hex')
}

/** Dedup key used when a provider event has no id — hash the raw payload. */
export function payloadFingerprint(rawBody: string): string {
  return `content_${sha256(rawBody).slice(0, 24)}`
}

/** Generic payload normalizer for supported providers. */
export function normalizeProviderEvent(provider: string, payload: Record<string, unknown>): NormalizedProviderEvent {
  switch (provider) {
    case 'mock': {
      const p = payload as Record<string, unknown>
      const eventType = String(p.event || 'payment.pending')
      const status = mapEventToPaymentStatus(eventType)
      return {
        providerEventId: p.provider_event_id ? String(p.provider_event_id) : p.id ? String(p.id) : '',
        eventType,
        paymentId: p.payment_id ? String(p.payment_id) : null,
        orderId: p.order_id ? String(p.order_id) : null,
        paymentRef: p.reference ? String(p.reference) : null,
        amount: typeof p.amount === 'number' ? p.amount : null,
        currency: p.currency ? String(p.currency) : null,
        ...(status ? {} : { eventType }),
      }
    }
    case 'razorpay': {
      const entity = (payload.entity as Record<string, unknown> | undefined) || payload
      const event = String(payload.event || 'payment.pending')
      let paymentId: string | null = null
      let orderId: string | null = null
      let amount: number | null = null
      let currency: string | null = null
      if (typeof entity.id === 'string') paymentId = entity.id
      if (typeof entity.order_id === 'string') orderId = entity.order_id
      if (typeof entity.amount === 'number') amount = entity.amount / 100
      if (typeof entity.currency === 'string') currency = entity.currency
      const providerEventId = (payload.id as string | undefined) || `${event}_${paymentId}_${orderId}`
      return {
        providerEventId: providerEventId || payloadFingerprint(JSON.stringify(payload)),
        eventType: mapRazorpayEvent(event),
        paymentId,
        orderId,
        amount,
        currency,
      }
    }
    default:
      throw new Error(`Unsupported webhook provider: ${provider}`)
  }
}

export function mapEventToPaymentStatus(eventType: string): PaymentStatus {
  switch (eventType) {
    case 'payment.succeeded':
      return 'paid'
    case 'payment.failed':
      return 'failed'
    case 'payment.expired':
      return 'expired'
    case 'payment.refunded':
      return 'refunded'
    case 'payment.partially_refunded':
      return 'partially_refunded'
    case 'payment.disputed':
      return 'disputed'
    default:
      return 'pending'
  }
}

function mapRazorpayEvent(event: string): string {
  switch (event) {
    case 'payment.captured':
    case 'order.paid':
      return 'payment.succeeded'
    case 'payment.failed':
      return 'payment.failed'
    case 'payment.pending':
      return 'payment.pending'
    case 'refund.created':
    case 'payment.refunded':
      return 'payment.refunded'
    case 'payment.disputed':
      return 'payment.disputed'
    default:
      return 'payment.pending'
  }
}

export interface WebhookProcessResult {
  eventId: string
  signatureValid: boolean
  duplicate: boolean
  paymentId: string | null
  changed: boolean
  flagged: boolean
  error?: string
}

interface ApplyStatusInput {
  paymentId: string
  merchantId: string
  status: PaymentStatus
  eventType: string
  providerEventId: string
  amount?: number | null
  currency?: string | null
  providerResponse?: unknown
}

/**
 * Apply a provider-verified status change to the payment + order, in a
 * transaction. Writes status history + audit. On `paid`, advances the order to
 * `new` (only if it was still `pending_payment`).
 */
async function applyPaymentStatus(input: ApplyStatusInput) {
  const { paymentId, merchantId, status, eventType, amount, currency, providerResponse } = input

  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({ where: { id: paymentId, merchantId } })
    if (!payment) throw new Error('Payment not found for this merchant')

    const prevStatus = payment.status
    const changed = prevStatus !== status

    // ---- amount/currency validation for money-moving events -----------------
    let flagged = false
    let mismatchError: string | null = null
    if ((status === 'paid' || status === 'failed') && amount !== null && amount !== undefined) {
      if (Math.round(amount * 100) !== Math.round(payment.amount.toNumber() * 100)) {
        flagged = true
        mismatchError = `Amount mismatch: provider reported ${amount} but payment amount is ${payment.amount.toNumber()}`
      }
    }
    if (currency && currency !== payment.currency) {
      flagged = true
      mismatchError = `Currency mismatch: provider reported ${currency} but payment currency is ${payment.currency}`
    }

    if (flagged) {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          amountMismatch: true,
          providerResponse: {
            ...((payment.providerResponse as Record<string, unknown> | null) || {}),
            flagged_for_review: mismatchError,
          },
        },
      })
      await logAudit({
        merchantId,
        actorUserId: null,
        action: 'payment_review_required',
        entityType: 'payment',
        entityId: payment.id,
        metadata: { reason: mismatchError, provider_event: eventType },
      })
      return { changed: false, flagged: true, error: mismatchError }
    }

    if (!changed) return { changed: false, flagged: false }

    const mergedResponse = {
      ...((payment.providerResponse as Record<string, unknown> | null) || {}),
      ...(providerResponse ? { last_provider_event: providerResponse } : {}),
    }

    // ---- update payment -----------------------------------------------------
    const paymentUpdate: Record<string, unknown> = {
      status,
      providerResponse: mergedResponse,
      paidAt: status === 'paid' ? new Date() : payment.paidAt,
      failedAt: status === 'failed' ? new Date() : payment.failedAt,
    }
    await tx.payment.update({ where: { id: payment.id }, data: paymentUpdate })

    await tx.webhookEvent.updateMany({
      where: { id: input.providerEventId || '' },
      data: { paymentId: payment.id, merchantId },
    })

    // ---- history + audit -----------------------------------------------------
    await tx.orderStatusHistory.create({
      data: {
        merchantId,
        orderId: payment.orderId || '',
        previousStatus: prevStatus,
        newStatus: status,
        statusType: 'payment',
        changedByUserId: null,
        changedByType: 'system',
        changeReason: `Webhook ${eventType} processed`,
      },
    })

    await logAudit({
      merchantId,
      actorUserId: null,
      action: 'payment_webhook_applied',
      entityType: 'payment',
      entityId: payment.id,
      metadata: { from: prevStatus, to: status, event: eventType, provider: payment.provider },
    })

    // ---- update order ---------------------------------------------------------
    let orderAdvanced = false
    if (payment.orderId) {
      const order = await tx.order.findFirst({ where: { id: payment.orderId, merchantId } })

      if (status === 'paid') {
        await tx.order.update({
          where: { id: payment.orderId },
          data: {
            paymentStatus: 'paid',
            paidAt: new Date(),
            orderStatus: order?.orderStatus === 'pending_payment' ? 'new' : order?.orderStatus,
          },
        })
        await tx.orderStatusHistory.create({
          data: {
            merchantId,
            orderId: payment.orderId,
            previousStatus: prevStatus,
            newStatus: status,
            statusType: 'payment',
            changedByUserId: null,
            changedByType: 'system',
            changeReason: 'Payment confirmed via webhook',
          },
        })
        if (order?.orderStatus === 'pending_payment') {
          await tx.orderStatusHistory.create({
            data: {
              merchantId,
              orderId: payment.orderId,
              previousStatus: 'pending_payment',
              newStatus: 'new',
              statusType: 'order',
              changedByUserId: null,
              changedByType: 'system',
              changeReason: 'Order confirmed after successful payment',
            },
          })
          orderAdvanced = true
        }
      } else if (status === 'failed') {
        await tx.order.update({
          where: { id: payment.orderId },
          data: { paymentStatus: 'failed', paidAt: null },
        })
      } else {
        // expired / refunded / partially_refunded / disputed / pending
        await tx.order.update({
          where: { id: payment.orderId },
          data: { paymentStatus: status },
        })
      }
    }

    return { changed: true, flagged: false, orderAdvanced }
  }, { timeout: 30000 })
}

/**
 * Entry point for provider webhooks. Verifies the signature, persists the
 * provider event (idempotent on provider event id), validates amounts and
 * updates payment/order. After a successful (non-duplicate, non-flagged)
 * change, emails + merchant-outgoing webhooks fire.
 */
export async function processProviderWebhook(params: {
  provider: string
  rawBody: string
  signature: string | null
  secret: string
}): Promise<WebhookProcessResult> {
  const { provider, rawBody, signature, secret } = params

  const adapter = getProvider(provider as 'mock' | 'upi' | 'razorpay' | 'cashfree')
  const signatureValid = adapter.verifyWebhookSignature({ rawBody, signature, secret })
  // Drop unsigned or wrongly signed requests before touching the database, so
  // strangers can't fill the webhook_events table.
  if (!signatureValid) {
    return { eventId: '', signatureValid: false, duplicate: false, paymentId: null, changed: false, flagged: false, error: 'Signature verification failed' }
  }

  const rawPayload = JSON.parse(rawBody || '{}') as Record<string, unknown>
  const fingerprints = normalizeProviderEvent(provider, rawPayload)
  const eventId = (fingerprints.providerEventId || payloadFingerprint(rawBody)).slice(0, 80)

  // Persist the event first (source of truth for dedupe).
  const event = await prisma.webhookEvent.create({
    data: {
      provider,
      providerEventId: eventId,
      eventType: fingerprints.eventType || 'payment.pending',
      signatureValid: true,
      payload: rawPayload as unknown as Prisma.InputJsonValue,
      processingStatus: 'received',
    },
  }).catch(async (err: unknown) => {
    // Unique constraint on (provider, provider_event_id) → duplicate delivery.
    const isDuplicate =
      typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'
    if (isDuplicate) {
      const existing = await prisma.webhookEvent.findFirst({ where: { provider, providerEventId: eventId } })
      if (existing) {
        await prisma.webhookEvent.update({
          where: { id: existing.id },
          data: { processingStatus: 'duplicate', processedAt: new Date() },
        })
        return { ...existing, processingStatus: 'duplicate' as const }
      }
      return null
    }
    throw err
  })

  if (!event) throw new Error('Failed to persist webhook event')

  if (event.processingStatus === 'duplicate') {
    return { eventId: event.id, signatureValid: true, duplicate: true, paymentId: event.paymentId, changed: false, flagged: false }
  }

  await prisma.webhookEvent.update({
    where: { id: event.id },
    data: { processingStatus: 'processing' },
  })

  const status = mapEventToPaymentStatus(fingerprints.eventType)

  try {
    // ---- locate the payment ---------------------------------------------------
    const payment = await prisma.payment.findFirst({
      where: {
        merchantId: event.merchantId ?? undefined,
        AND: [
          {
            OR: [
              ...(fingerprints.paymentId ? [{ providerPaymentId: fingerprints.paymentId }] : []),
              ...(fingerprints.orderId ? [{ providerOrderId: fingerprints.orderId }] : []),
              ...(fingerprints.paymentRef ? [{ paymentReference: fingerprints.paymentRef }] : []),
            ],
          },
        ],
      },
      include: { order: true, merchant: true },
    })

    let paymentId: string | null = payment?.id ?? null

    if (!payment) {
      // Try to find via merchant cross-reference
      const viaRef = fingerprints.paymentRef
        ? await prisma.payment.findFirst({ where: { paymentReference: fingerprints.paymentRef } })
        : null

      const resolvedPayment = viaRef
      if (!resolvedPayment) {
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: {
            processingStatus: 'failed_processing',
            processingError: 'Payment not found for webhook',
            processedAt: new Date(),
          },
        })
        return { eventId: event.id, signatureValid: true, duplicate: false, paymentId: null, changed: false, flagged: false, error: 'Payment not found' }
      }
      paymentId = resolvedPayment.id
      const apply = await applyPaymentStatus({
        paymentId: resolvedPayment.id,
        merchantId: resolvedPayment.merchantId,
        status,
        eventType: fingerprints.eventType,
        providerEventId: event.id,
        amount: fingerprints.amount,
        currency: fingerprints.currency,
        providerResponse: rawPayload,
      })
      const finalPayment = await prisma.payment.findUnique({ where: { id: resolvedPayment.id }, include: { order: true } })
      if (finalPayment?.order && apply.changed) {
        await notifyAfterChange(finalPayment.order, finalPayment, fingerprints.eventType, apply.orderAdvanced)
      }
      if (apply.changed) {
        await runPostApplyHooks({
          merchantId: resolvedPayment.merchantId,
          paymentId: resolvedPayment.id,
          orderId: finalPayment?.order?.id ?? null,
          status,
          provider,
          rawPayload,
          amount: fingerprints.amount,
        })
      }
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          merchantId: resolvedPayment.merchantId,
          paymentId: resolvedPayment.id,
          processingStatus: apply.flagged ? 'failed_processing' : 'processed',
          processingError: apply.error ?? null,
          processedAt: new Date(),
        },
      })
      return {
        eventId: event.id,
        signatureValid: true,
        duplicate: false,
        paymentId,
        changed: apply.changed,
        flagged: apply.flagged,
        error: apply.error ?? undefined,
      }
    }

    // ---- scoped lookup found ---------------------------------------------------
const apply = await applyPaymentStatus({
        paymentId: payment.id,
        merchantId: payment.merchantId,
        status,
        eventType: fingerprints.eventType,
        providerEventId: event.id,
        amount: fingerprints.amount,
        currency: fingerprints.currency,
        providerResponse: rawPayload,
      })

    if (apply.changed && payment.order) {
      const updatedPayment = await prisma.payment.findUnique({ where: { id: payment.id } })
      if (updatedPayment) {
        await notifyAfterChange(payment.order, updatedPayment, fingerprints.eventType, apply.orderAdvanced)
      }
    }
    if (apply.changed) {
      await runPostApplyHooks({
        merchantId: payment.merchantId,
        paymentId: payment.id,
        orderId: payment.order?.id ?? null,
        status,
        provider,
        rawPayload,
        amount: fingerprints.amount,
      })
    }

    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        processingStatus: apply.flagged ? 'failed_processing' : 'processed',
        processingError: apply.error ?? null,
        processedAt: new Date(),
      },
    })

    return {
      eventId: event.id,
      signatureValid: true,
      duplicate: false,
      paymentId,
      changed: apply.changed,
      flagged: apply.flagged,
      error: apply.error ?? undefined,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Processing failed'
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { processingStatus: 'failed_processing', processingError: message, processedAt: new Date() },
    })
    return { eventId: event.id, signatureValid: true, duplicate: false, paymentId: null, changed: false, flagged: false, error: message }
  }
}

/** Post-change side effects (inventory + refund finalization). Never throws. */
async function runPostApplyHooks(params: {
  merchantId: string
  paymentId: string
  orderId?: string | null
  status: PaymentStatus
  provider: string
  rawPayload: Record<string, unknown>
  amount?: number | null
}) {
  try {
    if (params.status === 'paid') {
      if (params.orderId) {
        await applyInventoryDeductionOnMode({
          merchantId: params.merchantId,
          orderId: params.orderId,
          mode: 'on_payment',
        })
      }
    } else if (params.status === 'refunded' || params.status === 'partially_refunded') {
      const providerRefundId = extractProviderRefundId(params.provider, params.rawPayload)
      await completeRefundFromProviderWebhook({
        merchantId: params.merchantId,
        paymentId: params.paymentId,
        providerRefundId,
        amount: params.amount ?? null,
      })
    }
  } catch {
    // Non-fatal: hooks must never break webhook processing.
  }
}

/** Post-change fan-out: emails + merchant outgoing webhooks. */
async function notifyAfterChange(
  order: { id: string; orderNumber: string; customerId: string | null; merchantId: string; totalAmount: { toNumber(): number }; currency: string },
  payment: {
    id: string
    mode: KeyMode
    merchantId: string
    checkoutSessionId: string
    amount: { toNumber(): number }
    currency: string
    provider: string
    status: PaymentStatus
  },
  eventType: string,
  orderAdvanced = false
) {
  const customer = order.customerId
    ? await prisma.customer.findUnique({ where: { id: order.customerId } })
    : null

  const checkoutUrl = `${TOROPAY_PUBLIC_URL}/checkout/${payment.checkoutSessionId}`
  const context = buildEmailContextFromCheckout({
    orderNumber: order.orderNumber,
    amount: payment.amount.toNumber(),
    currency: payment.currency,
    customerName: customer?.fullName ?? null,
    products: [],
    checkoutUrl,
  })

  if (payment.status === 'paid') {
    // customer + merchant emails
    if (customer?.email) {
      await sendAutomatedEmail({ merchantId: order.merchantId, key: 'payment_received', to: customer.email, context })
    }
    await sendAutomatedEmail({
      merchantId: order.merchantId,
      key: 'merchant_payment_received',
      to: null,
      context,
    }).catch(() => {})
    // outgoing webhooks
    await dispatchMerchantWebhook({
      merchantId: order.merchantId,
      mode: payment.mode,
      eventType: 'payment.paid',
      data: {
        order_id: order.id,
        order_number: order.orderNumber,
        payment_id: payment.id,
        payment_status: 'paid',
        amount: payment.amount.toNumber(),
        currency: payment.currency,
      },
    }).catch(() => {})
    if (orderAdvanced) {
      await dispatchMerchantWebhook({
        merchantId: order.merchantId,
        mode: payment.mode,
        eventType: 'order.paid',
        data: {
          order_id: order.id,
          order_number: order.orderNumber,
          payment_status: 'paid',
          amount: payment.amount.toNumber(),
          currency: payment.currency,
        },
      }).catch(() => {})
    }
  } else if (payment.status === 'failed') {
    if (customer?.email) {
      await sendAutomatedEmail({ merchantId: order.merchantId, key: 'payment_failed', to: customer.email, context })
    }
    await dispatchMerchantWebhook({
      merchantId: order.merchantId,
      mode: payment.mode,
      eventType: 'payment.failed',
      data: {
        order_id: order.id,
        order_number: order.orderNumber,
        payment_id: payment.id,
        payment_status: 'failed',
        amount: payment.amount.toNumber(),
        currency: payment.currency,
      },
    }).catch(() => {})
  }
}

/**
 * Settle a payment as paid from an external signal (e.g. a Shopify
 * `orders/paid` webhook). Idempotent — a payment that is already paid is a
 * no-op. Reuses the same status-apply + notification path as provider webhooks.
 */
export async function settlePaymentFromExternal(params: {
  paymentId: string
  merchantId: string
  source: string
  referenceId?: string | null
}): Promise<{ ok: boolean; changed: boolean; alreadyPaid: boolean; error?: string }> {
  const payment = await prisma.payment.findFirst({
    where: { id: params.paymentId, merchantId: params.merchantId },
  })
  if (!payment) return { ok: false, changed: false, alreadyPaid: false, error: 'Payment not found' }
  if (payment.status === 'paid') return { ok: true, changed: false, alreadyPaid: true }

  try {
    const apply = await applyPaymentStatus({
      paymentId: payment.id,
      merchantId: params.merchantId,
      status: 'paid',
      eventType: 'payment.succeeded',
      providerEventId: `external_${params.source}_${payment.id}`.slice(0, 80),
      amount: payment.amount.toNumber(),
      currency: payment.currency,
      providerResponse: { source: params.source, reference_id: params.referenceId ?? null },
    })

    if (apply.changed) {
      const full = await prisma.payment.findUnique({ where: { id: payment.id }, include: { order: true } })
      if (full?.order) {
        await notifyAfterChange(full.order, full, 'payment.succeeded', apply.orderAdvanced).catch(() => {})
      }
      await runPostApplyHooks({
        merchantId: params.merchantId,
        paymentId: payment.id,
        orderId: full?.order?.id ?? null,
        status: 'paid',
        provider: payment.provider,
        rawPayload: { source: params.source, reference_id: params.referenceId ?? null },
        amount: payment.amount.toNumber(),
      }).catch(() => {})
    }

    return { ok: true, changed: apply.changed, alreadyPaid: false }
  } catch (err) {
    return {
      ok: false,
      changed: false,
      alreadyPaid: false,
      error: err instanceof Error ? err.message : 'Failed to settle payment',
    }
  }
}

/** Manual reconciliation for pending payments (dashboard action). */
export async function reconcilePayment(paymentId: string, merchantId: string) {
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, merchantId } })
  if (!payment) return { ok: false, error: 'Payment not found' }
  if (!payment.providerPaymentId) return { ok: false, error: 'Payment has no provider reference' }

  const adapter = getProvider(payment.provider as 'mock' | 'upi' | 'razorpay' | 'cashfree')
  const status = await adapter.getPaymentStatus(payment.providerPaymentId)

  if (status.status === 'paid' && payment.status !== 'paid') {
    const apply = await applyPaymentStatus({
      paymentId: payment.id,
      merchantId,
      status: 'paid',
      eventType: 'payment.succeeded',
      providerEventId: `reconcile_${payment.id}`,
      amount: payment.amount.toNumber(),
      currency: payment.currency,
      providerResponse: { source: 'manual_reconciliation', ...status.providerResponse },
    })
    if (apply.changed) {
      const full = await prisma.payment.findUnique({ where: { id: payment.id }, include: { order: true } })
      if (full?.order) {
        await notifyAfterChange(full.order, full, 'payment.succeeded', apply.orderAdvanced)
      }
      await runPostApplyHooks({
        merchantId,
        paymentId: payment.id,
        orderId: full?.order?.id ?? null,
        status: 'paid',
        provider: payment.provider,
        rawPayload: {},
        amount: payment.amount.toNumber(),
      })
    }
    return { ok: apply.changed || apply.flagged, flagged: apply.flagged, status: 'paid' }
  }

  return { ok: false, status: status.status, note: 'Payment is not in a paid state (or already applied)' }
}