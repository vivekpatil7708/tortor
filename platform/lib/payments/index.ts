import type { PaymentProvider, PaymentProviderName } from './provider'
import { MockPaymentProvider } from './mock'
import { UpiPaymentProvider } from './upi'
import { RazorpayPaymentProvider } from './razorpay'
import { CashfreePaymentProvider } from './cashfree'

const instances: Partial<Record<PaymentProviderName, PaymentProvider>> = {}

/**
 * Resolve a provider adapter. The mock is the default (no credentials needed).
 * Razorpay is only used when explicitly requested AND configured; otherwise we
 * silently fall back to the mock so local/test flows never hard-depend on a
 * third-party account.
 */
export function getProvider(name: PaymentProviderName): PaymentProvider {
  if (instances[name]) return instances[name]!

  let provider: PaymentProvider
  switch (name) {
    case 'razorpay': {
      const rzp = new RazorpayPaymentProvider()
      // If razorpay isn't configured, don't hand out an unusable provider for business flows.
      provider = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET ? rzp : new MockPaymentProvider()
      break
    }
    case 'cashfree': {
      const cf = new CashfreePaymentProvider()
      provider = process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY ? cf : new MockPaymentProvider()
      break
    }
    case 'upi': {
      provider = new UpiPaymentProvider()
      break
    }
    default:
      provider = new MockPaymentProvider()
  }

  instances[name] = provider
  return provider
}

export function getActiveProvider(merchantProvider?: string): PaymentProvider {
  return getProvider((merchantProvider as PaymentProviderName) || 'mock')
}

export { SUPPORTED_PAYMENT_METHODS, isSupportedPaymentMethod } from './provider'
export type {
  PaymentProvider,
  PaymentProviderName,
  CheckoutSessionResult,
  PaymentLinkResult,
} from './provider'