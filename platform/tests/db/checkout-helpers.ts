import { POST as createOrderRoute } from '@/app/api/v1/orders/route'
import { POST as providerWebhookRoute } from '@/app/api/webhooks/payments/[provider]/route'
import { POST as upiNotifyRoute } from '@/app/api/checkout/[session]/upi-notify/route'
import { request, signMockWebhook } from './helpers'

/** A website order like a merchant's shop would send: one ₹499 item. */
export const orderBody = (overrides: Record<string, unknown> = {}) => ({
  items: [{ name: 'Diwali hamper', quantity: 1, unit_price: 499 }],
  customer: { name: 'Asha', email: 'asha@example.com', phone: '+919999999999' },
  ...overrides,
})

/** Creates an order through the real website-checkout API with a test-mode key. */
export async function createOrder(apiKey: string, body: Record<string, unknown>) {
  const res = await createOrderRoute(request('/api/v1/orders', {
    method: 'POST',
    body,
    headers: { authorization: `Bearer ${apiKey}`, 'x-toropay-mode': 'test' },
  }))
  return { status: res.status, body: await res.json() }
}

/** Delivers a payment-provider webhook (the mock provider), signed unless told otherwise. */
export function deliverWebhook(rawBody: string, signature = signMockWebhook(rawBody)) {
  return providerWebhookRoute(
    request('/api/webhooks/payments/mock', { method: 'POST', body: rawBody, headers: { 'x-toropay-signature': signature } }),
    { params: Promise.resolve({ provider: 'mock' }) },
  )
}

/** The customer's "I've completed payment" on a UPI website checkout. */
export async function upiNotify(session: string) {
  const res = await upiNotifyRoute(request(`/api/checkout/${session}/upi-notify`, { method: 'POST' }), { params: Promise.resolve({ session }) })
  return { status: res.status, body: await res.json() }
}
