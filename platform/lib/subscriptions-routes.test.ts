import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { istDayStart } from './ist-day'

const db = vi.hoisted(() => ({
  subscription: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  customer: { findFirst: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

const auth = vi.hoisted(() => ({ requireSession: vi.fn() }))
vi.mock('@/lib/auth', () => auth)

import { GET, POST } from '@/app/api/subscriptions/route'

const customer = { id: 'c1', fullName: 'Asha Rao', phone: '9876543210', email: 'asha@example.com' }

function subscriptionRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 's1',
    merchantId: 'm1',
    customerId: 'c1',
    planName: 'Care plan',
    amount: 499,
    frequency: 'monthly',
    nextBillingDate: istDayStart('2026-11-03')!,
    status: 'active',
    cancelToken: 'cancel-token',
    lastReminderAt: null,
    lastBilledAt: null,
    cancelledAt: null,
    createdAt: new Date('2026-10-27T00:00:00.000Z'),
    updatedAt: new Date('2026-10-27T00:00:00.000Z'),
    customer,
    payments: [],
    ...over,
  }
}

const post = (body: unknown) =>
  new NextRequest('http://localhost/api/subscriptions', {
    method: 'POST',
    body: JSON.stringify(body),
  })

beforeEach(() => {
  vi.clearAllMocks()
  auth.requireSession.mockResolvedValue({ id: 'm1', emailVerifiedAt: new Date() })
  db.subscription.findMany.mockResolvedValue([subscriptionRow()])
  db.subscription.count.mockResolvedValue(1)
  db.customer.findFirst.mockResolvedValue(customer)
  db.subscription.create.mockImplementation(async (args: { data: Record<string, unknown> }) =>
    subscriptionRow({ ...args.data, customer }),
  )
})

describe('subscription dashboard API', () => {
  it('lists only the signed-in merchant’s subscriptions', async () => {
    const res = await GET(new NextRequest('http://localhost/api/subscriptions?customer_id=c1&status=active'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(db.subscription.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ merchantId: 'm1', customerId: 'c1', status: 'active' }),
    }))
    expect(body.total).toBe(1)
    expect(body.subscriptions[0]).toEqual(expect.objectContaining({
      id: 's1',
      plan_name: 'Care plan',
      customer: expect.objectContaining({ full_name: 'Asha Rao' }),
    }))
    // The cancellation capability token never reaches the dashboard.
    expect(body.subscriptions[0].cancel_token).toBeUndefined()
  })

  it('creates a plan for a customer of this merchant', async () => {
    const res = await POST(post({
      customer_id: 'c1',
      plan_name: '  Care plan  ',
      amount: '499',
      frequency: 'monthly',
      next_billing_date: '2026-11-03',
    }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(db.customer.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'c1', merchantId: 'm1' },
    }))
    expect(db.subscription.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        merchantId: 'm1',
        customerId: 'c1',
        planName: 'Care plan',
        amount: 499,
        frequency: 'monthly',
        nextBillingDate: istDayStart('2026-11-03'),
        status: 'active',
      }),
    }))
    const token = (db.subscription.create.mock.calls[0][0] as { data: { cancelToken: string } }).data.cancelToken
    expect(token).toHaveLength(48)
    expect(body.subscription.plan_name).toBe('Care plan')
  })

  it('rejects a billing date in the past', async () => {
    const res = await POST(post({
      customer_id: 'c1',
      plan_name: 'Care plan',
      amount: 499,
      frequency: 'monthly',
      next_billing_date: '2020-01-01',
    }))

    expect(res.status).toBe(400)
    expect(db.subscription.create).not.toHaveBeenCalled()
  })

  it('rejects an unknown frequency', async () => {
    const res = await POST(post({
      customer_id: 'c1',
      plan_name: 'Care plan',
      amount: 499,
      frequency: 'daily',
      next_billing_date: '2026-11-03',
    }))

    expect(res.status).toBe(400)
    expect(db.customer.findFirst).not.toHaveBeenCalled()
  })

  it('requires a verified email before creating a plan', async () => {
    auth.requireSession.mockResolvedValue({ id: 'm1', emailVerifiedAt: null })

    const res = await POST(post({
      customer_id: 'c1',
      plan_name: 'Care plan',
      amount: 499,
      frequency: 'monthly',
      next_billing_date: '2026-11-03',
    }))

    expect(res.status).toBe(403)
    expect(db.subscription.create).not.toHaveBeenCalled()
  })
})
