import { beforeEach, describe, expect, it, vi } from 'vitest'

// The payment-link webhook retry run (retryDueWebhookLogs) with the database
// and the network replaced by fakes.
const db = vi.hoisted(() => ({
  webhookLog: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  transaction: { findUnique: vi.fn() },
  merchantSettings: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
}))
const postWebhook = vi.hoisted(() => vi.fn())
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/safe-fetch', () => ({ postWebhook, UnsafeWebhookUrlError: class extends Error {} }))

import { retryDueWebhookLogs, signWebhookPayload } from '@/lib/webhooks'

const body = JSON.stringify({ event: 'payment.success', event_id: 'evt_abc', txn_id: 'TXN1', status: 'success' })
const dueLog = (overrides: Record<string, unknown> = {}) => ({
  id: 'log1', merchantId: 'm1', transactionId: 't1', url: 'https://shop.example.com/hook', payload: body,
  retryCount: 1, status: 'failed', nextRetryAt: new Date(Date.now() - 60_000),
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  db.webhookLog.updateMany.mockResolvedValue({ count: 1 })
  db.transaction.findUnique.mockResolvedValue({ status: 'success' })
  db.merchantSettings.findUnique.mockResolvedValue({ webhookSecret: 'whsec_test' })
})

describe('retryDueWebhookLogs', () => {
  it('only picks up retries that fell due in the last 48 hours', async () => {
    db.webhookLog.findMany.mockResolvedValue([])
    await retryDueWebhookLogs()

    const { where } = db.webhookLog.findMany.mock.calls[0][0]
    expect(where.status).toBe('failed')
    expect((Date.now() - where.nextRetryAt.gte.getTime()) / 3_600_000).toBeCloseTo(48, 1)
    expect(where.nextRetryAt.lte.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('resends the same body and event ID, signed, and records the delivery', async () => {
    db.webhookLog.findMany.mockResolvedValue([dueLog()])
    postWebhook.mockResolvedValue({ status: 200, ok: true, body: 'ok' })

    expect(await retryDueWebhookLogs()).toBe(1)
    expect(postWebhook).toHaveBeenCalledWith('https://shop.example.com/hook', {
      headers: expect.objectContaining({
        'X-ToroPay-Event-Id': 'evt_abc',
        'X-ToroPay-Signature': signWebhookPayload(body, 'whsec_test'),
      }),
      body,
    })
    expect(db.webhookLog.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'delivered', nextRetryAt: null }),
    }))
  })

  it('schedules the next retry when the merchant site fails again', async () => {
    db.webhookLog.findMany.mockResolvedValue([dueLog({ retryCount: 2 })])
    postWebhook.mockResolvedValue({ status: 500, ok: false, body: 'down' })

    await retryDueWebhookLogs()

    const { data } = db.webhookLog.update.mock.calls[0][0]
    expect(data.status).toBe('failed')
    expect(data.retryCount).toBe(3)
    expect((data.nextRetryAt.getTime() - Date.now()) / 60_000).toBeCloseTo(30, 0)
  })

  it('drops an older event once the payment has moved on', async () => {
    db.webhookLog.findMany.mockResolvedValue([
      dueLog({ payload: JSON.stringify({ event: 'payment.pending', event_id: 'evt_old', status: 'pending' }) }),
    ])

    expect(await retryDueWebhookLogs()).toBe(0)
    expect(postWebhook).not.toHaveBeenCalled()
    expect(db.webhookLog.update).toHaveBeenCalledWith({ where: { id: 'log1' }, data: { status: 'superseded', nextRetryAt: null } })
  })

  it('skips a delivery that another run already claimed', async () => {
    db.webhookLog.findMany.mockResolvedValue([dueLog()])
    db.webhookLog.updateMany.mockResolvedValue({ count: 0 })

    expect(await retryDueWebhookLogs()).toBe(0)
    expect(postWebhook).not.toHaveBeenCalled()
  })
})
