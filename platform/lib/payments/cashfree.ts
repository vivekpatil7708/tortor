import type {
  CheckoutSessionResult,
  CreateCheckoutSessionInput,
  CreatePaymentLinkInput,
  PaymentLinkResult,
  PaymentProvider,
} from './provider'

/**
 * Cashfree adapter placeholder. The full integration is planned for a later
 * phase — this scaffold satisfies the PaymentProvider contract so the factory
 * can hand out a provider without branching business logic.
 *
 * Until CASHFREE_APP_ID / CASHFREE_SECRET_KEY are configured this adapter
 * refuses to create sessions and only answers read/verify operations.
 */
export class CashfreePaymentProvider implements PaymentProvider {
  readonly name = 'cashfree' as const

  private get isConfigured(): boolean {
    return Boolean(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY)
  }

  async createCheckoutSession(_input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult> {
    throw new Error(
      'Cashfree integration is not wired up yet. Configure the adapter or use the mock provider.'
    )
  }

  async createPaymentLink(_input: CreatePaymentLinkInput): Promise<PaymentLinkResult> {
    throw new Error('Cashfree integration is not wired up yet.')
  }

  async getPaymentStatus(_paymentId: string) {
    return { status: 'pending' as const }
  }

  verifyWebhookSignature(_params: { rawBody: string; signature: string | null; secret: string }): boolean {
    return false
  }

  async refundPayment(_params: { paymentId: string; amount: number; reason?: string | null }) {
    return { success: false, error: 'Refunds are not supported for Cashfree in this phase' }
  }

  async expirePaymentLink(_linkId: string) {
    return { success: false }
  }

  supportsPaymentMethod(_method: string): boolean {
    return false
  }
}