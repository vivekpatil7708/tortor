import crypto from 'crypto'
import type {
  CheckoutSessionResult,
  CreateCheckoutSessionInput,
  CreatePaymentLinkInput,
  PaymentLinkResult,
  PaymentProvider,
  PaymentStatus,
} from './provider'

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || ''
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || ''
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || ''
const RAZORPAY_API = process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com/v1'

function authHeader(): string {
  return 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')
}

function mapRazorpayStatus(status: string): PaymentStatus {
  switch (status) {
    case 'paid':
    case 'captured':
      return 'paid'
    case 'failed':
    case 'cancelled':
    case 'attempted':
      return 'failed'
    case 'expired':
      return 'expired'
    case 'refunded':
    case 'partially_refunded':
      return 'refunded'
    default:
      return 'pending'
  }
}

/**
 * Optional Razorpay adapter. Only active when RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET
 * are configured. Structure matches the PaymentProvider contract so the rest of
 * the app is provider-agnostic.
 */
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = 'razorpay' as const

  private get isConfigured(): boolean {
    return Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET)
  }

  private failIfUnconfigured() {
    if (!this.isConfigured) {
      throw new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.')
    }
  }

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult> {
    this.failIfUnconfigured()
    const res = await fetch(`${RAZORPAY_API}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
      body: JSON.stringify({
        amount: Math.round(input.amount * 100),
        currency: input.currency,
        receipt: input.paymentReference,
        notes: {
          merchant_id: input.merchantId,
          order_id: input.orderId,
          toropay_payment_id: input.paymentId,
        },
        ...(input.expiresAt ? { expires_at: Math.floor(input.expiresAt.getTime() / 1000) } : {}),
      }),
    })
    if (!res.ok) throw new Error(`Razorpay order creation failed: ${res.status}`)
    const body = (await res.json()) as { id: string }
    return {
      providerPaymentId: `pay_${body.id}`,
      providerOrderId: body.id,
      providerCheckoutSessionId: body.id,
      checkoutUrl: `https://checkout.razorpay.com/v1/checkout.js?order_id=${body.id}`,
      status: 'processing',
      providerResponse: body,
    }
  }

  async createPaymentLink(input: CreatePaymentLinkInput): Promise<PaymentLinkResult> {
    this.failIfUnconfigured()
    const res = await fetch(`${RAZORPAY_API}/payment_links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
      body: JSON.stringify({
        amount: Math.round(input.amount * 100),
        currency: input.currency,
        description: input.description ?? undefined,
        notes: { merchant_id: input.merchantId, toropay_payment_ref: input.paymentReference },
        ...(input.customer?.email || input.customer?.phone
          ? {
              customer: {
                name: input.customer.name ?? undefined,
                email: input.customer.email ?? undefined,
                contact: (input.customer.phone || '').replace(/\D/g, ''),
              },
            }
          : {}),
      }),
    })
    if (!res.ok) throw new Error(`Razorpay payment link creation failed: ${res.status}`)
    const body = (await res.json()) as { id: string; short_url?: string }
    return {
      providerPaymentId: body.id,
      providerLinkId: body.id,
      linkUrl: body.short_url ?? null,
      status: 'processing',
      providerResponse: body,
    }
  }

  async getPaymentStatus(paymentId: string) {
    if (!this.isConfigured) return { status: 'pending' as const }
    const res = await fetch(`${RAZORPAY_API}/payments/${paymentId}`, {
      headers: { Authorization: authHeader() },
    })
    if (!res.ok) return { status: 'pending' as const }
    const body = (await res.json()) as { status: string }
    return { status: mapRazorpayStatus(body.status) }
  }

  verifyWebhookSignature({ rawBody, signature, secret }: { rawBody: string; signature: string | null; secret: string }): boolean {
    if (!signature) return false
    const expected = crypto.createHmac('sha256', secret || RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex')
    const a = Buffer.from(expected)
    const b = Buffer.from(signature)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  }

  async refundPayment(params: { paymentId: string; amount: number; reason?: string | null }) {
    if (!this.isConfigured) return { success: false, error: 'Razorpay is not configured' }
    try {
      const res = await fetch(`${RAZORPAY_API}/payments/${params.paymentId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
        body: JSON.stringify({
          amount: Math.round(params.amount * 100),
          notes: { reason: params.reason ?? undefined },
        }),
      })
      if (!res.ok) return { success: false, error: `Razorpay refund failed: ${res.status}` }
      const body = (await res.json()) as { id?: string; status?: string }
      return {
        success: true,
        providerRefundId: body.id ?? null,
        status: body.status === 'processed' ? ('processed' as const) : ('pending' as const),
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Razorpay refund failed' }
    }
  }

  async expirePaymentLink(linkId: string) {
    if (!this.isConfigured) return { success: false }
    const res = await fetch(`${RAZORPAY_API}/payment_links/${linkId}/cancel`, {
      method: 'POST',
      headers: { Authorization: authHeader() },
    })
    return { success: res.ok }
  }

  supportsPaymentMethod(method: string): boolean {
    return ['card', 'upi', 'netbanking', 'wallet'].includes(method)
  }
}