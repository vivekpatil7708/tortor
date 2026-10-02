import type {
  CheckoutSessionResult,
  CreateCheckoutSessionInput,
  CreatePaymentLinkInput,
  PaymentLinkResult,
  PaymentProvider,
} from './provider'

/**
 * Direct UPI payment provider.
 *
 * The customer pays the merchant's own UPI ID (VPA) by scanning a QR code or
 * tapping a UPI deep link. No payment gateway is involved — the money moves
 * straight to the merchant's bank account. Confirmation is manual: the customer
 * marks the payment as sent, then the merchant confirms it as paid from the
 * dashboard.
 */
export class UpiPaymentProvider implements PaymentProvider {
  readonly name = 'upi' as const

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult> {
    const providerPaymentId = `upi_${input.paymentId.replace(/-/g, '').slice(0, 20)}`
    const checkoutUrl = `/checkout/${input.checkoutSessionId}?provider=upi`
    return {
      providerPaymentId,
      providerCheckoutSessionId: input.checkoutSessionId,
      checkoutUrl,
      status: 'pending',
      providerResponse: {
        upi: true,
        eia: 'Customer pays directly to the merchant UPI ID via QR / deep link.',
      },
    }
  }

  async createPaymentLink(input: CreatePaymentLinkInput): Promise<PaymentLinkResult> {
    const providerPaymentId = `upilink_${input.paymentReference.replace(/[^a-z0-9]/gi, '').slice(0, 20)}`
    return {
      providerPaymentId,
      providerLinkId: providerPaymentId,
      linkUrl: null,
      status: 'pending',
      providerResponse: { upi: true },
    }
  }

  async getPaymentStatus(_paymentId: string) {
    return { status: 'pending' as const, providerResponse: { upi: true } }
  }

  verifyWebhookSignature(): boolean {
    return false
  }

  async refundPayment(params: { paymentId: string; amount: number; reason?: string | null }) {
    return {
      success: false,
      error: 'Direct UPI refunds are not automated — please refund manually from your bank app.',
      status: 'failed' as const,
    }
  }

  async expirePaymentLink(_linkId: string) {
    return { success: true }
  }

  supportsPaymentMethod(method: string): boolean {
    return method === 'upi'
  }
}