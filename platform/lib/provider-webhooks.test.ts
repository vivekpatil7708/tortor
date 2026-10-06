import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Card-payment provider webhooks (Razorpay/Cashfree; the test uses the mock
// provider) with the database replaced by fakes.
const db = vi.hoisted(() => ({
  webhookEvent: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  payment: { findFirst: vi.fn(), findUnique: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/payments', () => ({ getProvider: () => ({ verifyWebhookSignature: () => true }) }))

import { processProviderWebhook } from '@/lib/payments/webhook-processor'
import { POST as providerWebhook } from '@/app/api/webhooks/payments/[provider]/route'

const rawBody = JSON.stringify({ id: 'evt_1', event: 'payment.captured', reference: 'PAY-REF-1', amount: 499 })
const deliver = () => processProviderWebhook({ provider: 'mock', rawBody, signature: 'sig', secret: 'secret' })
const event = (processingStatus: string) => ({ id: 'we1', merchantId: null, paymentId: null, processingStatus })
const alreadySeen = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  db.webhookEvent.create.mockResolvedValue(event('received'))
  db.webhookEvent.updateMany.mockResolvedValue({ count: 1 })
  db.webhookEvent.update.mockResolvedValue({})
  db.payment.findFirst.mockResolvedValue(null)
})

describe('card payment webhooks that fail to save (B11)', () => {
  it('asks the provider to retry, and leaves the event for that retry', async () => {
    db.payment.findFirst.mockRejectedValue(new Error('Can\'t reach database server'))

    const result = await deliver()

    expect(result).toMatchObject({ retryable: true, duplicate: false })
    expect(db.webhookEvent.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'we1' },
      data: expect.objectContaining({ processingStatus: 'received' }),
    }))
  })

  it('processes the event again when the provider resends it', async () => {
    db.webhookEvent.create.mockRejectedValue(alreadySeen)
    db.webhookEvent.findFirst.mockResolvedValue(event('received'))

    const result = await deliver()

    expect(result.duplicate).toBe(false)
    expect(db.webhookEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'we1' }),
      data: { processingStatus: 'processing', processingError: null },
    }))
    expect(db.payment.findFirst).toHaveBeenCalled()
  })

  it('skips a true duplicate and leaves the original record as it was', async () => {
    db.webhookEvent.create.mockRejectedValue(alreadySeen)
    db.webhookEvent.findFirst.mockResolvedValue({ ...event('processed'), paymentId: 'p1' })
    db.webhookEvent.updateMany.mockResolvedValue({ count: 0 })

    const result = await deliver()

    expect(result).toMatchObject({ duplicate: true, paymentId: 'p1' })
    expect(db.payment.findFirst).not.toHaveBeenCalled()
    expect(db.webhookEvent.update).not.toHaveBeenCalled()
  })

  it('only one of two simultaneous deliveries processes the event', async () => {
    db.webhookEvent.updateMany.mockResolvedValueOnce({ count: 0 }) // another delivery claimed it first
    expect((await deliver()).duplicate).toBe(true)
    expect(db.payment.findFirst).not.toHaveBeenCalled()
  })

  it('still accepts events for unknown payments: retrying would not help', async () => {
    const result = await deliver()

    expect(result.retryable).toBeUndefined()
    expect(result.error).toBe('Payment not found')
  })
})

describe('provider webhook route (B11)', () => {
  const post = () => providerWebhook(
    new NextRequest('http://localhost/api/webhooks/payments/mock', { method: 'POST', body: rawBody, headers: { 'x-toropay-signature': 'sig' } }),
    { params: Promise.resolve({ provider: 'mock' }) },
  )

  it('answers 500 when saving failed, so the provider sends it again', async () => {
    db.payment.findFirst.mockRejectedValue(new Error('Can\'t reach database server'))
    const res = await post()
    expect(res.status).toBe(500)
  })

  it('answers 200 for duplicates and unknown payments', async () => {
    expect((await post()).status).toBe(200) // unknown payment

    db.webhookEvent.create.mockRejectedValue(alreadySeen)
    db.webhookEvent.findFirst.mockResolvedValue(event('processed'))
    db.webhookEvent.updateMany.mockResolvedValue({ count: 0 })
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ duplicate: true })
  })
})
