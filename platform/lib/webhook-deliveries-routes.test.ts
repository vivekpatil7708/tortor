import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const db = vi.hoisted(() => ({
  webhookDeliveryLog: {
    findMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
    findFirst: vi.fn(),
  },
  webhookEndpoint: { findMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

const auth = vi.hoisted(() => ({ requireMerchant: vi.fn() }))
vi.mock('@/lib/tenant', () => auth)

const delivery = vi.hoisted(() => ({ retryWebhookDelivery: vi.fn() }))
vi.mock('@/lib/webhook-delivery', () => delivery)

import { GET as listLogs, POST as retryLog } from '@/app/api/webhook-deliveries/route'

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'd1',
  eventId: 'evt_1',
  eventType: 'payment.confirmed',
  status: 'failed',
  endpointId: 'we1',
  endpoint: { url: 'https://example.com/hooks', mode: 'live' },
  url: 'https://example.com/hooks',
  responseCode: 500,
  responseBody: 'boom',
  errorMessage: null,
  retryCount: 2,
  nextRetryAt: null,
  deliveredAt: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  payload: JSON.stringify({ id: 'evt_1', type: 'payment.confirmed', data: { amount: 1499 } }),
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.requireMerchant.mockResolvedValue({ id: 'm1', teamRole: 'owner' })
  db.webhookDeliveryLog.findMany.mockResolvedValue([row()])
  db.webhookDeliveryLog.count.mockResolvedValue(1)
  db.webhookDeliveryLog.groupBy.mockResolvedValue([{ status: 'failed', _count: { _all: 1 } }])
  db.webhookEndpoint.findMany.mockResolvedValue([{ id: 'we1', url: 'https://example.com/hooks', mode: 'live' }])
})

describe('global webhook logs', () => {
  it('lists the merchant deliveries with counts and endpoint filters', async () => {
    const res = await listLogs(new NextRequest('http://localhost/api/webhook-deliveries?status=failed'))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.logs[0]).toEqual(expect.objectContaining({
      id: 'd1',
      event_type: 'payment.confirmed',
      status: 'failed',
      endpoint_url: 'https://example.com/hooks',
      retry_count: 2,
    }))
    expect(body.total).toBe(1)
    expect(body.counts.failed).toBe(1)
    expect(body.endpoints).toHaveLength(1)
    expect(db.webhookDeliveryLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { merchantId: 'm1', status: 'failed' },
      orderBy: { createdAt: 'desc' },
    }))
  })

  it('never returns another merchant\'s deliveries', async () => {
    await listLogs(new NextRequest('http://localhost/api/webhook-deliveries'))
    expect(db.webhookDeliveryLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { merchantId: 'm1' },
    }))
  })
})

describe('retrying a delivery from the logs page', () => {
  it('retries a delivery that belongs to the merchant', async () => {
    db.webhookDeliveryLog.findFirst.mockResolvedValue({ id: 'd1' })
    delivery.retryWebhookDelivery.mockResolvedValue('delivered')

    const res = await retryLog(new NextRequest('http://localhost/x', {
      method: 'POST',
      body: JSON.stringify({ logId: 'd1' }),
    }))
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('delivered')
    expect(db.webhookDeliveryLog.findFirst).toHaveBeenCalledWith({
      where: { id: 'd1', merchantId: 'm1' },
      select: { id: true },
    })
  })

  it('rejects a delivery from another merchant', async () => {
    db.webhookDeliveryLog.findFirst.mockResolvedValue(null)

    const res = await retryLog(new NextRequest('http://localhost/x', {
      method: 'POST',
      body: JSON.stringify({ logId: 'someone-elses' }),
    }))
    expect(res.status).toBe(404)
    expect(delivery.retryWebhookDelivery).not.toHaveBeenCalled()
  })

  it('keeps viewers read-only', async () => {
    auth.requireMerchant.mockResolvedValue({ id: 'm1', teamRole: 'viewer' })

    const res = await retryLog(new NextRequest('http://localhost/x', {
      method: 'POST',
      body: JSON.stringify({ logId: 'd1' }),
    }))
    expect(res.status).toBe(403)
    expect(db.webhookDeliveryLog.findFirst).not.toHaveBeenCalled()
  })
})
