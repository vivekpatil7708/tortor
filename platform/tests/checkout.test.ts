import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { makeMerchant } from './helpers'
import { createCheckout, getCheckoutView, updateCheckoutCustomer } from '@/lib/checkout'

describe('integration: hosted checkout sessions', () => {
  let merchantId = ''

  beforeAll(async () => {
    const m = await makeMerchant()
    merchantId = m.id
  })

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE payments, checkout_links, webhook_events, webhook_delivery_logs, webhook_endpoints, email_logs, email_templates, api_request_logs, api_keys, order_status_history, order_items, orders, products, customers RESTART IDENTITY CASCADE'
    )
  })

  it('creates a pending payment + order with computed totals', async () => {
    const result = await createCheckout({
      merchantId,
      mode: 'live',
      customer: { name: 'Ravi Kumar', email: 'ravi@test.dev' },
      items: [{ productName: 'Tee', quantity: 2, unitPrice: 499.5 }, { productName: 'Shipping', quantity: 1, unitPrice: 40 }],
      shippingAmount: 0,
    })

    expect(result).toMatchObject({
      status: 'pending',
      mode: 'live',
      reused: false,
    })
    expect(result.order_number).toMatch(/^TP-/)
    expect(result.payment_reference).toMatch(/^TPPAY-/)
    expect(result.checkout_session_id).toMatch(/^cs_/)

    const payment = await prisma.payment.findUnique({ where: { checkoutSessionId: result.checkout_session_id } })
    expect(payment).not.toBeNull()
    expect(Number(payment!.amount)).toBeCloseTo(1039, 0) // 2*499.5 + 40
    expect(payment!.providerPaymentId).toMatch(/^mockpay_/)
    expect(payment!.merchantId).toBe(merchantId)
  })

  it('returns the same order on idempotent retries', async () => {
    const input = {
      merchantId,
      mode: 'test' as const,
      idempotencyKey: 'idem-123',
      items: [{ productName: 'Widget', quantity: 1, unitPrice: 100 }],
    }
    const first = await createCheckout(input)
    const second = await createCheckout(input)

    expect(second.reused).toBe(true)
    expect(second.toropay_order_id).toBe(first.toropay_order_id)
    expect(second.checkout_session_id).toBe(first.checkout_session_id)
    const count = await prisma.payment.count({ where: { merchantId, idempotencyKey: 'idem-123' } })
    expect(count).toBe(1)
  })

  it('reuses an order created by the same merchant order reference', async () => {
    const ref = 'WEB-ORDER-42'
    const first = await createCheckout({
      merchantId,
      mode: 'live',
      merchantOrderReference: ref,
      items: [{ productName: 'Ebook', quantity: 1, unitPrice: 299 }],
    })
    const second = await createCheckout({
      merchantId,
      mode: 'live',
      merchantOrderReference: ref,
      items: [{ productName: 'Ebook', quantity: 1, unitPrice: 299 }],
    })
    expect(second.reused).toBe(true)
    expect(second.checkout_session_id).toBe(first.checkout_session_id)
  })

  it('exposes a clean public view without secrets', async () => {
    const result = await createCheckout({
      merchantId,
      mode: 'test',
      customer: { name: 'Anita', email: 'anita@test.dev', phone: '9911111111' },
      items: [{ productName: 'Plan', quantity: 1, unitPrice: 1200 }],
      shippingAmount: 0,
    })
    const view = await getCheckoutView(result.checkout_session_id)
    expect(view).not.toBeNull()
    expect(view!.payment.amount).toBe(1200)
    expect(view!.order.customer_name).toBe('Anita')
    expect(view!.order.items).toHaveLength(1)
    expect(view!.order.items[0].line_total).toBe(1200)
    expect(JSON.stringify(view)).not.toContain('secret')
  })

  it('updates customer details collected on the checkout form (reusing rows)', async () => {
    const result = await createCheckout({
      merchantId,
      mode: 'test',
      items: [{ productName: 'Gift', quantity: 1, unitPrice: 50 }],
    })
    const view = await updateCheckoutCustomer({
      checkoutSessionId: result.checkout_session_id,
      name: 'Sneha P',
      email: 'sneha@test.dev',
      phone: '9822222222',
    })
    expect(view!.order.customer_name).toBe('Sneha P')
    expect(view!.order.customer_email).toBe('sneha@test.dev')

    const same = await updateCheckoutCustomer({
      checkoutSessionId: result.checkout_session_id,
      name: 'Sneha P',
      email: 'sneha@test.dev',
    })
    expect(await prisma.customer.count({ where: { merchantId, email: 'sneha@test.dev' } })).toBe(1)
    expect(same!.order.customer_name).toBe('Sneha P')
  })

  it('stores the correct mode + testMode flag on the order', async () => {
    const live = await createCheckout({
      merchantId,
      mode: 'live',
      items: [{ productName: 'A', quantity: 1, unitPrice: 10 }],
    })
    const test = await createCheckout({
      merchantId,
      mode: 'test',
      items: [{ productName: 'A', quantity: 1, unitPrice: 10 }],
    })
    const liveOrder = await prisma.order.findUnique({ where: { id: live.toropay_order_id } })
    const testOrder = await prisma.order.findUnique({ where: { id: test.toropay_order_id } })
    expect(liveOrder!.testMode).toBe(false)
    expect(testOrder!.testMode).toBe(true)

    const livePayment = await prisma.payment.findUnique({ where: { checkoutSessionId: live.checkout_session_id } })
    const testPayment = await prisma.payment.findUnique({ where: { checkoutSessionId: test.checkout_session_id } })
    expect(livePayment!.status).toBe('pending')
    expect(testPayment!.status).toBe('processing')
  })
})