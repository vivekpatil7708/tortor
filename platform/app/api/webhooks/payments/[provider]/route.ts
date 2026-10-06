import { NextRequest, NextResponse } from 'next/server'
import { getProvider } from '@/lib/payments'
import { MOCK_WEBHOOK_SECRET, mockPaymentsAllowed } from '@/lib/payments/mock'
import { processProviderWebhook } from '@/lib/payments/webhook-processor'

/**
 * Incoming payment webhook from a provider. The raw body is required for
 * signature verification, so we read `req.text()` before parsing JSON.
 *
 * Responds 2xx to the provider as fast as possible; processing happens
 * inline (idempotent on provider event id).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const provider = (await ctx.params).provider
  if (provider === 'mock' && !mockPaymentsAllowed()) {
    return NextResponse.json({ error: 'Provider not configured' }, { status: 503 })
  }

  const adapter = getProvider(provider as 'mock' | 'upi' | 'razorpay' | 'cashfree')
  const secret = adapter
    ? { mock: MOCK_WEBHOOK_SECRET, razorpay: process.env.RAZORPAY_WEBHOOK_SECRET, cashfree: process.env.CASHFREE_WEBHOOK_SECRET }[provider]
    : null

  const rawBody = await req.text()
  if (!rawBody) return NextResponse.json({ error: 'Empty body' }, { status: 400 })

  const signature =
    req.headers.get('x-toropay-signature') ??
    req.headers.get('x-razorpay-signature') ??
    req.headers.get('x-cashfree-signature')

  if (!secret) {
    return NextResponse.json({ error: 'Provider not configured' }, { status: 503 })
  }

  const result = await processProviderWebhook({ provider, rawBody, signature, secret })

  if (!result.signatureValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  if (result.flagged) {
    return NextResponse.json({
      accepted: true,
      flagged: true,
      reason: result.error ?? 'Payment flagged for review',
      event_id: result.eventId,
    })
  }

  if (result.duplicate) {
    return NextResponse.json({ accepted: true, duplicate: true, event_id: result.eventId })
  }

  if (result.error) {
    return NextResponse.json({ accepted: true, warning: result.error, event_id: result.eventId })
  }

  return NextResponse.json({
    accepted: true,
    changed: result.changed,
    payment_id: result.paymentId,
    event_id: result.eventId,
  })
}