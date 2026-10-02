import type { KeyMode, PaymentStatus } from '@prisma/client'

export type { PaymentStatus }

export type PaymentProviderName = 'mock' | 'upi' | 'razorpay' | 'cashfree'

export interface CheckoutCustomer {
  name?: string | null
  email?: string | null
  phone?: string | null
}

export interface CreateCheckoutSessionInput {
  merchantId: string
  orderId: string
  paymentId: string
  checkoutSessionId: string
  paymentReference: string
  amount: number
  currency: string
  mode: KeyMode
  customer?: CheckoutCustomer | null
  description?: string | null
  successUrl?: string | null
  cancelUrl?: string | null
  metadata?: Record<string, unknown> | null
  expiresAt?: Date | null
}

export interface CheckoutSessionResult {
  providerPaymentId: string
  providerOrderId?: string | null
  providerCheckoutSessionId?: string | null
  checkoutUrl?: string | null
  status: 'pending' | 'processing'
  expiresAt?: Date | null
  providerResponse?: Record<string, unknown> | null
}

export interface CreatePaymentLinkInput {
  merchantId: string
  paymentReference: string
  amount: number
  currency: string
  mode: KeyMode
  description?: string | null
  customer?: CheckoutCustomer | null
  metadata?: Record<string, unknown> | null
}

export interface PaymentLinkResult {
  providerPaymentId: string
  providerLinkId?: string | null
  linkUrl?: string | null
  status: 'pending' | 'processing'
  expiresAt?: Date | null
  providerResponse?: Record<string, unknown> | null
}

export interface ProviderWebhookPayload {
  providerEventId: string
  eventType: string
  paymentId: string
  orderId?: string | null
  paymentRef?: string | null
  status: PaymentStatus
  amount?: number | null
  checkId?: string | null
  raw: Record<string, unknown>
}

/**
 * Payment provider abstraction. Business logic must only ever depend on this
 * interface — never on a specific provider SDK.
 */
export interface PaymentProvider {
  readonly name: PaymentProviderName
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult>
  createPaymentLink(input: CreatePaymentLinkInput): Promise<PaymentLinkResult>
  getPaymentStatus(paymentId: string): Promise<{ status: PaymentStatus; providerResponse?: Record<string, unknown> }>
  verifyWebhookSignature(params: { rawBody: string; signature: string | null; secret: string }): boolean
  refundPayment(params: { paymentId: string; amount: number; reason?: string | null }): Promise<{
    success: boolean
    error?: string
    providerRefundId?: string | null
    status?: 'pending' | 'processed' | 'completed' | 'failed'
  }>
  expirePaymentLink(linkId: string): Promise<{ success: boolean }>
  supportsPaymentMethod(method: string): boolean
}

export const SUPPORTED_PAYMENT_METHODS = ['card', 'upi', 'netbanking', 'wallet', 'mock'] as const

export function isSupportedPaymentMethod(method: string): boolean {
  return (SUPPORTED_PAYMENT_METHODS as readonly string[]).includes(method)
}