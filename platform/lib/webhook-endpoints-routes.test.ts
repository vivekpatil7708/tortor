import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Webhook config UI (Phase 1): listing, creating, editing end delete of endpoints,
// plus the delivery log and retry action.
const db = vi.hoisted(() => ({
  webhookEndpoint: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  webhookDeliveryLog: { findMany: vi.fn(), findFirst: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

const auth = vi.hoisted(() => ({ requireSession: vi.fn() }))
vi.mock('@/lib/auth', () => auth)

const delivery = vi.hoisted(() => ({ retryWebhookDelivery: vi.fn(), sendTestWebhook: vi.fn() }))
vi.mock('@/lib/webhook-delivery', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/webhook-delivery')>()
  return { ...actual, retryWebhookDelivery: delivery.retryWebhookDelivery, sendTestWebhook: delivery.sendTestWebhook }
})

import { GET as listEndpoints, POST as createEndpoint } from '@/app/api/webhook-endpoints/route'
import { PATCH as updateEndpoint, DELETE as deleteEndpoint } from '@/app/api/webhook-endpoints/[id]/route'
import { GET as listDeliveries, POST as retryDelivery } from '@/app/api/webhook-endpoints/[id]/deliveries/route'
import { POST as sendTest } from '@/app/api/webhook-endpoints/[id]/test/route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })

const endpointRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'we1', merchantId: 'm1', url: 'https://example.com/hooks', mode: 'live', active: true,
  eventTypes: ['order.created'], failedCount: 0, lastDeliveryAt: null,
  createdAt: new Date('2026-10-01T00:00:00Z'), updatedAt: new Date('2026-10-01T00:00:00Z'),
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.requireSession.mockResolvedValue({ id: 'm1', emailVerifiedAt: new Date() })
  db.webhookEndpoint.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => endpointRow(data))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('listing endpoints', () => {
  it('returns each endpoint without ever leaking the signing secret', async () => {
    db.webhookEndpoint.findMany.mockResolvedValue([endpointRow()])

    const body = await (await listEndpoints()).json()
    expect(body).toEqual([expect.objectContaining({ id: 'we1', url: 'https://example.com/hooks', event_types: ['order.created'] })])
    expect(JSON.stringify(body)).not.toContain('secret')
  })

  it('reports a database failure as 500, not as "signed out"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.webhookEndpoint.findMany.mockRejectedValue(Object.assign(new Error('connection lost'), { code: 'P1001' }))
    expect((await listEndpoints()).status).toBe(401)

    auth.requireSession.mockRejectedValue(new Error('Unauthorized'))
    expect((await listEndpoints()).status).toBe(401)
  })
})

describe('creating an endpoint', () => {
  const post = (body: unknown) => createEndpoint(new NextRequest('http://localhost/api/webhook-endpoints', {
    method: 'POST', body: JSON.stringify(body),
  }))

  it('generates a signing secret once and returns it', async () => {
    const res = await post({ url: 'https://example.com/hooks', mode: 'live', eventTypes: ['order.created', 'order.paid'] })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.secret).toMatch(/^whsec_/)
    expect(body.event_types).toEqual(['order.created', 'order.paid'])
    expect(db.webhookEndpoint.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ merchantId: 'm1', mode: 'live', eventTypes: ['order.created', 'order.paid'] }),
    }))
  })

  it('refuses a non-https or private URL', async () => {
    expect((await post({ url: 'http://example.com/hooks', eventTypes: ['order.created'] })).status).toBe(400)
    expect((await post({ url: 'https://localhost/hooks', eventTypes: ['order.created'] })).status).toBe(400)
    expect(db.webhookEndpoint.create).not.toHaveBeenCalled()
  })

  it('refuses a request with no events selected', async () => {
    expect((await post({ url: 'https://example.com/hooks', eventTypes: [] })).status).toBe(400)
  })

  it('drops event names it does not know', async () => {
    await post({ url: 'https://example.com/hooks', eventTypes: ['order.created', 'made.up.event'] })
    expect(db.webhookEndpoint.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventTypes: ['order.created'] }),
    }))
  })

  it('requires a verified email', async () => {
    auth.requireSession.mockResolvedValue({ id: 'm1', emailVerifiedAt: null })
    expect((await post({ url: 'https://example.com/hooks', eventTypes: ['order.created'] })).status).toBe(403)
  })
})

describe('editing and deleting an endpoint', () => {
  it('turns an endpoint off and on', async () => {
    db.webhookEndpoint.findFirst.mockResolvedValue(endpointRow())
    db.webhookEndpoint.update.mockResolvedValue(endpointRow({ active: false }))

    const res = await updateEndpoint(
      new NextRequest('http://localhost/x', { method: 'PATCH', body: JSON.stringify({ active: false }) }),
      params('we1')
    )
    expect(res.status).toBe(200)
    expect(db.webhookEndpoint.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'we1' }, data: { active: false } }))
  })

  it('will not touch an endpoint that belongs to another merchant', async () => {
    db.webhookEndpoint.findFirst.mockResolvedValue(null)
    const res = await updateEndpoint(
      new NextRequest('http://localhost/x', { method: 'PATCH', body: JSON.stringify({ active: false }) }),
      params('someone-elses')
    )
    expect(res.status).toBe(404)
    expect(db.webhookEndpoint.update).not.toHaveBeenCalled()
  })

  it('deletes only your own endpoint', async () => {
    db.webhookEndpoint.deleteMany.mockResolvedValue({ count: 1 })
    expect((await deleteEndpoint(new NextRequest('http://localhost/x', { method: 'DELETE' }), params('we1'))).status).toBe(200)
    expect(db.webhookEndpoint.deleteMany).toHaveBeenCalledWith({ where: { id: 'we1', merchantId: 'm1' } })

    db.webhookEndpoint.deleteMany.mockResolvedValue({ count: 0 })
    expect((await deleteEndpoint(new NextRequest('http://localhost/x', { method: 'DELETE' }), params('we2'))).status).toBe(404)
  })
})

describe('delivery log and retry', () => {
  it('lists recent deliveries for your endpoint', async () => {
    db.webhookEndpoint.findFirst.mockResolvedValue({ id: 'we1' })
    db.webhookDeliveryLog.findMany.mockResolvedValue([{
      id: 'd1', eventId: 'evt_1', eventType: 'order.created', status: 'failed', responseCode: 500,
      responseBody: 'boom', errorMessage: null, retryCount: 2, nextRetryAt: null, deliveredAt: null,
      createdAt: new Date('2026-10-01T00:00:00Z'),
    }])

    const body = await (await listDeliveries(new NextRequest('http://localhost/api/webhook-endpoints/we1/deliveries'), params('we1'))).json()
    expect(body[0]).toEqual(expect.objectContaining({ id: 'd1', status: 'failed', retry_count: 2, response_body: 'boom' }))
    expect(db.webhookDeliveryLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { endpointId: 'we1', merchantId: 'm1' },
    }))
  })

  it('retries a delivery that belongs to your endpoint', async () => {
    db.webhookEndpoint.findFirst.mockResolvedValue({ id: 'we1' })
    db.webhookDeliveryLog.findFirst.mockResolvedValue({ id: 'd1' })
    delivery.retryWebhookDelivery.mockResolvedValue('delivered')

    const res = await retryDelivery(
      new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify({ logId: 'd1' }) }),
      params('we1')
    )
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('delivered')
  })

  it('rejects retry of a delivery that is not yours', async () => {
    db.webhookEndpoint.findFirst.mockResolvedValue({ id: 'we1' })
    db.webhookDeliveryLog.findFirst.mockResolvedValue(null)
    const res = await retryDelivery(
      new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify({ logId: 'nope' }) }),
      params('we1')
    )
    expect(res.status).toBe(404)
    expect(delivery.retryWebhookDelivery).not.toHaveBeenCalled()
  })
})

describe('sending a test event', () => {
  it('reports success when the endpoint accepts it', async () => {
    delivery.sendTestWebhook.mockResolvedValue({ success: true, logId: 'd9' })
    const res = await sendTest(new NextRequest('http://localhost/x', { method: 'POST' }), params('we1'))
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
    expect(delivery.sendTestWebhook).toHaveBeenCalledWith('we1', 'm1')
  })

  it('reports a 404 when the endpoint is not yours', async () => {
    delivery.sendTestWebhook.mockResolvedValue({ success: false })
    expect((await sendTest(new NextRequest('http://localhost/x', { method: 'POST' }), params('we9'))).status).toBe(404)
  })
})
