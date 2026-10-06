import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createApiKey, createMerchant, resetDatabase, unique } from './helpers'
import { createOrder, deliverWebhook, orderBody } from './checkout-helpers'

let paymentReference = ''
let orderId = ''

beforeEach(async () => {
  await resetDatabase()
  const merchant = await createMerchant({ withUpi: false }) // card-provider checkout (test mode)
  const order = await createOrder(await createApiKey(merchant.id), orderBody())
  expect(order.status).toBe(201)
  paymentReference = order.body.payment_reference
  orderId = order.body.toropay_order_id
})

const event = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ id: `evt_${unique()}`, event: 'payment.succeeded', reference: paymentReference, amount: 499, currency: 'INR', ...overrides })
const payment = () => prisma.payment.findFirstOrThrow({ where: { paymentReference } })
const order = () => prisma.order.findUniqueOrThrow({ where: { id: orderId } })

describe('card-payment webhooks on the real database (QA priority 4)', () => {
  it('a success marks the payment paid and moves the order on', async () => {
    const res = await deliverWebhook(event())

    expect(res.status).toBe(200)
    expect(await payment()).toMatchObject({ status: 'paid' })
    expect((await order()).paymentStatus).toBe('paid')
  })

  it('a failure is recorded, and the order stays unpaid', async () => {
    expect((await deliverWebhook(event({ event: 'payment.failed' }))).status).toBe(200)

    expect(await payment()).toMatchObject({ status: 'failed' })
    expect((await order()).paymentStatus).not.toBe('paid')
  })

  it('a wrong signature is refused before anything is stored', async () => {
    const before = (await payment()).status
    const res = await deliverWebhook(event(), 'not-the-real-signature')

    expect(res.status).toBe(401)
    expect(await prisma.webhookEvent.count()).toBe(0)
    expect((await payment()).status).toBe(before)
  })

  it("a wrong amount is flagged, and the payment isn't marked paid", async () => {
    const res = await deliverWebhook(event({ amount: 1 }))

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ flagged: true })
    expect((await payment()).status).not.toBe('paid')
    expect((await order()).paymentStatus).not.toBe('paid')
  })

  it('a database failure asks the provider to retry, and the resent event is applied once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const body = event()
    const before = (await payment()).status

    // The payments table is briefly unavailable while the event arrives.
    await prisma.$executeRawUnsafe('ALTER TABLE payments RENAME TO payments_unavailable')
    let first: Response
    try {
      first = await deliverWebhook(body)
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE payments_unavailable RENAME TO payments')
      await prisma.$disconnect()
    }
    expect(first.status).toBe(500)
    expect(await prisma.webhookEvent.findFirstOrThrow()).toMatchObject({ processingStatus: 'received' })
    expect((await payment()).status).toBe(before)

    // The provider sends it again.
    expect((await deliverWebhook(body)).status).toBe(200)
    expect(await payment()).toMatchObject({ status: 'paid' })
    expect(await prisma.webhookEvent.findFirstOrThrow()).toMatchObject({ processingStatus: 'processed' })
    expect(await prisma.webhookEvent.count()).toBe(1)
  })
})
