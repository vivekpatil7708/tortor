import crypto from 'crypto'
import type {
  CheckoutSessionResult,
  CreateCheckoutSessionInput,
  CreatePaymentLinkInput,
  PaymentLinkResult,
  PaymentProvider,
} from './provider'

/**
 * Secret that signs simulated (mock) payment webhooks. Without
 * MOCK_WEBHOOK_SECRET a random per-process value is used, so nobody outside
 * can forge a mock webhook; in-app simulation still works.
 */
export const MOCK_WEBHOOK_SECRET =
  process.env.MOCK_WEBHOOK_SECRET || crypto.randomBytes(32).toString('hex')

/**
 * Mock payments never move money. They are always available in development;
 * in production only when PAYMENTS_ALLOW_MOCK=true.
 */
export function mockPaymentsAllowed(): boolean {
  return process.env.PAYMENTS_ALLOW_MOCK === 'true' || process.env.NODE_ENV !== 'production'
}

/**
 * Mock payment provider for local development and tests.
 *
 * - `createCheckoutSession` returns an immediately usable session; no real
 *   money moves. A successful payment is simulated by POSTing to
 *   `/api/webhooks/payments/mock` with an HMAC signature.
 * - No external network access.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock' as const

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult> {
    const providerPaymentId = `mockpay_${input.paymentId.replace(/-/g, '').slice(0, 20)}`
    const providerOrderId = `mockord_${input.orderId.replace(/-/g, '').slice(0, 20)}`
    const checkoutUrl = `/checkout/${input.checkoutSessionId}?provider=mock`
    return {
      providerPaymentId,
      providerOrderId,
      providerCheckoutSessionId: input.checkoutSessionId,
      checkoutUrl,
      status: input.mode === 'test' ? 'processing' : 'pending',
      providerResponse: {
        mode: input.mode,
        simulation: true,
        eia: 'Mock payment — no real charge.',
      },
    }
  }

  async createPaymentLink(input: CreatePaymentLinkInput): Promise<PaymentLinkResult> {
    const providerPaymentId = `mocklink_${input.paymentReference.replace(/[^a-z0-9]/gi, '').slice(0, 20)}`
    return {
      providerPaymentId,
      providerLinkId: providerPaymentId,
      linkUrl: null,
      status: 'pending',
      providerResponse: { simulation: true },
    }
  }

  async getPaymentStatus(_paymentId: string) {
    return { status: 'pending' as const }
  }

  verifyWebhookSignature({ rawBody, signature, secret }: { rawBody: string; signature: string | null; secret: string }): boolean {
    if (!signature) return false
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    const a = Buffer.from(expected)
    const b = Buffer.from(signature)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  }

  /** Sign a mock webhook payload using the shared mock secret. */
  signWebhook(body: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(body).digest('hex')
  }

  async refundPayment(params: { paymentId: string; amount: number; reason?: string | null }) {
    const providerRefundId = `mockref_${params.paymentId.replace(/[^a-z0-9]/gi, '').slice(0, 16)}_${Date.now()}`
    return { success: true, providerRefundId, status: 'processed' as const }
  }

  async expirePaymentLink(_linkId: string) {
    return { success: true }
  }

  supportsPaymentMethod(method: string): boolean {
    return method === 'mock' || method === 'upi' || method === 'card'
  }
}

export type MockWebhookEventName =
  | 'payment.pending'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.expired'
  | 'payment.refunded'

export interface MockWebhookPayload {
  event: MockWebhookEventName
  provider_event_id: string
  payment_id: string
  order_id?: string | null
  payment_session?: string | null
  reference?: string | null
  amount: number
  currency: string
  [key: string]: unknown
}

/**
 * Build a canonical mock webhook payload for a payment. `amount` is in rupees
 * (the natural unit), matching how ToroPay stores amounts.
 */
export function buildMockWebhookPayload(params: {
  event: MockWebhookEventName
  providerEventId: string
  paymentId: string
  orderId?: string | null
  paymentReference?: string | null
  amount: number
  currency?: string
  extra?: Record<string, unknown>
}): MockWebhookPayload {
  return {
    event: params.event,
    provider_event_id: params.providerEventId,
    payment_id: params.paymentId,
    order_id: params.orderId ?? null,
    reference: params.paymentReference ?? null,
    amount: params.amount,
    currency: params.currency ?? 'INR',
    ...(params.extra ?? {}),
  }
}