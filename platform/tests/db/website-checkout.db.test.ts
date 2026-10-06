import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { POST as confirmPayment } from '@/app/api/payments/[id]/confirm/route'
import { GET as paymentStatus } from '@/app/api/v1/orders/[id]/payment-status/route'
import CancelPage from '@/app/checkout/[session]/cancel/page'
import { createApiKey, createMerchant, request, resetDatabase, signIn } from './helpers'
import { createOrder, orderBody, upiNotify } from './checkout-helpers'

beforeEach(resetDatabase)

async function confirm(paymentId: string) {
  const res = await confirmPayment(request(`/api/payments/${paymentId}/confirm`, { method: 'POST' }), { params: Promise.resolve({ id: paymentId }) })
  return { status: res.status, body: await res.json() }
}

describe('website-checkout API on the real database (QA priority 5)', () => {
  it('a retried order request with the same idempotency key returns the same order', async () => {
    const key = await createApiKey((await createMerchant()).id)

    const first = await createOrder(key, orderBody({ idempotency_key: 'shop-order-1001' }))
    const retry = await createOrder(key, orderBody({ idempotency_key: 'shop-order-1001' }))

    expect(first.status).toBe(201)
    expect(retry.status).toBe(200)
    expect(retry.body).toMatchObject({ toropay_order_id: first.body.toropay_order_id, reused: true })
    expect(await prisma.order.count()).toBe(1)
    expect(await prisma.payment.count()).toBe(1)
  })

  it('UPI: "I\'ve paid", then the merchant confirms; repeating either changes nothing', async () => {
    const merchant = await createMerchant() // has a UPI ID, so the checkout is a direct UPI payment
    const key = await createApiKey(merchant.id)
    const { body: order } = await createOrder(key, orderBody())
    const session = order.checkout_session_id

    expect((await upiNotify(session)).body).toMatchObject({ status: 'processing' })
    expect((await upiNotify(session)).body).toMatchObject({ status: 'processing' })

    const payment = await prisma.payment.findUniqueOrThrow({ where: { checkoutSessionId: session } })
    signIn(merchant)
    expect((await confirm(payment.id)).body).toMatchObject({ status: 'paid', changed: true })
    expect((await confirm(payment.id)).body).toMatchObject({ status: 'paid', already: true })
    expect((await upiNotify(session)).body).toMatchObject({ status: 'paid' })

    // The merchant's website asks for the status with its API key.
    const res = await paymentStatus(
      request(`/api/v1/orders/${order.toropay_order_id}/payment-status`, { headers: { authorization: `Bearer ${key}`, 'x-toropay-mode': 'test' } }),
      { params: Promise.resolve({ id: order.toropay_order_id }) },
    )
    expect(await res.json()).toMatchObject({ payment_status: 'paid' })
  })

  it('cancelling leaves the order unpaid, and it can still be paid afterwards', async () => {
    const merchant = await createMerchant()
    const { body: order } = await createOrder(await createApiKey(merchant.id), orderBody())
    const session = order.checkout_session_id

    await CancelPage({ params: Promise.resolve({ session }) }) // the customer lands on the cancel page

    expect(await prisma.payment.findUniqueOrThrow({ where: { checkoutSessionId: session } })).toMatchObject({ status: 'pending' })
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.toropay_order_id } })).toMatchObject({ paymentStatus: 'pending' })
    expect((await upiNotify(session)).body).toMatchObject({ status: 'processing' })
  })

  it("another merchant can't confirm the payment", async () => {
    const merchant = await createMerchant()
    const { body: order } = await createOrder(await createApiKey(merchant.id), orderBody())
    const payment = await prisma.payment.findUniqueOrThrow({ where: { checkoutSessionId: order.checkout_session_id } })

    signIn(await createMerchant())
    expect((await confirm(payment.id)).status).toBe(404)
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).toMatchObject({ status: 'pending' })
  })
})
