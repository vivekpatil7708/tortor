import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { MOCK_WEBHOOK_SECRET, buildMockWebhookPayload, MockPaymentProvider } from '@/lib/payments/mock'
import { processProviderWebhook } from '@/lib/payments/webhook-processor'
import { apiError, notFound } from '@/lib/api-response'

const mockProvider = new MockPaymentProvider()

/**
 * Simulate a successful (or failed) mock payment for a checkout session.
 * Builds a signed mock provider webhook and runs it through the standard
 * webhook processor so the full pipeline (dedupe, amount check, emails,
 * outgoing webhooks) is exercised. Only available for `mock` provider payments.
 */
export async function POST(req: NextRequest, ctx: { params: { session: string } }) {
  const body = (await req.json().catch(() => null)) as { event?: string; amount?: number } | null
  const event = body?.event === 'payment.failed' ? 'payment.failed' : 'payment.succeeded'

  const payment = await prisma.payment.findUnique({
    where: { checkoutSessionId: ctx.params.session },
    include: { order: true },
  })
  if (!payment) return notFound('Checkout not found')

  if (payment.provider !== 'mock') return apiError(400, 'Only mock payments can be simulated')
  if (payment.status === 'paid') return NextResponse.json({ status: payment.status, already: true })
  if (!payment.providerPaymentId) return apiError(409, 'Payment session not initialised')

  const payload = buildMockWebhookPayload({
    event,
    providerEventId: `mock_evt_${Date.now()}`,
    paymentId: payment.providerPaymentId,
    orderId: payment.orderId,
    paymentReference: payment.paymentReference,
    amount: body?.amount ?? payment.amount.toNumber(),
    currency: payment.currency,
  })
  const rawBody = JSON.stringify(payload)
  const signature = mockProvider.signWebhook(rawBody, MOCK_WEBHOOK_SECRET)

  const result = await processProviderWebhook({
    provider: 'mock',
    rawBody,
    signature,
    secret: MOCK_WEBHOOK_SECRET,
  })

  const updated = await prisma.payment.findUnique({ where: { id: payment.id } })
  return NextResponse.json({
    accepted: result.signatureValid,
    status: updated?.status,
    changed: result.changed,
    flagged: result.flagged,
    amount_mismatch: updated?.amountMismatch ?? false,
    reason: result.error ?? null,
  })
}