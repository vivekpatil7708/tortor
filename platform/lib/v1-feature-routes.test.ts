import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-pepper'

const db = vi.hoisted(() => ({
  coupon: { findMany: vi.fn(), create: vi.fn() },
  subscription: { findMany: vi.fn(), count: vi.fn() },
  customer: { findFirst: vi.fn() },
  loyaltyPoint: { aggregate: vi.fn(), findMany: vi.fn() },
  apiRequestLog: { create: vi.fn() },
}))

const refunds = vi.hoisted(() => ({
  listManualRefunds: vi.fn(),
  createManualRefund: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/refund-tracking', () => refunds)
vi.mock('@/lib/api-key', () => ({
  authenticateApiKey: vi.fn(async () => ({
    apiKeyId: 'k1',
    merchantId: 'm1',
    mode: 'test',
    scopes: ['read', 'write'],
  })),
}))

import { GET as listCoupons, POST as createCoupon } from '@/app/api/v1/coupons/route'
import { GET as listRefunds, POST as createRefund } from '@/app/api/v1/refunds/route'
import { GET as listSubscriptions } from '@/app/api/v1/subscriptions/route'
import { GET as getLoyalty } from '@/app/api/v1/loyalty/[customer_id]/route'

function req(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`http://localhost${path}`, init)
}

const coupon = (overrides: Record<string, unknown> = {}) => ({
  id: 'c1',
  merchantId: 'm1',
  code: 'SAVE10',
  discountType: 'percentage',
  discountValue: { toNumber: () => 10 },
  minOrderAmount: null,
  maxUses: null,
  usedCount: 0,
  expiresAt: null,
  isActive: true,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  ...overrides,
})

const subscription = {
  id: 's1',
  merchantId: 'm1',
  customerId: 'c1',
  planName: 'Care plan',
  amount: 499,
  frequency: 'monthly',
  nextBillingDate: new Date('2026-11-01T18:30:00Z'),
  status: 'active',
  cancelToken: 'token',
  lastReminderAt: null,
  lastBilledAt: null,
  cancelledAt: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  customer: { id: 'c1', fullName: 'Asha Rao', phone: '9876543210', email: null },
  payments: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  db.apiRequestLog.create.mockResolvedValue({})
  refunds.listManualRefunds.mockResolvedValue({ refunds: [], total_pending: 0, total_processed: 0 })
  refunds.createManualRefund.mockResolvedValue({ id: 'r1', amount: 50, status: 'pending' })
  db.subscription.findMany.mockResolvedValue([subscription])
  db.subscription.count.mockResolvedValue(1)
  db.customer.findFirst.mockResolvedValue({
    id: 'c1',
    fullName: 'Asha Rao',
    phone: '9876543210',
    email: 'asha@example.com',
  })
  db.loyaltyPoint.aggregate.mockImplementation(async (args: {
    where: { points?: { gt?: number; lt?: number } }
  }) => {
    if (args.where.points?.gt !== undefined) return { _sum: { points: 100 } }
    if (args.where.points?.lt !== undefined) return { _sum: { points: -20 } }
    return { _sum: { points: 80 } }
  })
  db.loyaltyPoint.findMany.mockResolvedValue([
    {
      id: 'lp1',
      points: 100,
      reason: 'Payment confirmed (TXN1)',
      transactionId: 't1',
      createdAt: new Date('2026-10-20T00:00:00Z'),
    },
    {
      id: 'lp2',
      points: -20,
      reason: 'Correction',
      transactionId: null,
      createdAt: new Date('2026-10-21T00:00:00Z'),
    },
  ])
})

describe('GET /api/v1/coupons', () => {
  it('lists and filters coupons for the API-key merchant', async () => {
    db.coupon.findMany.mockResolvedValue([coupon(), coupon({ id: 'c2', code: 'OLD', isActive: false })])

    const res = await listCoupons(req('/api/v1/coupons?status=active&page=1&page_size=10'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.total).toBe(1)
    expect(json.coupons).toHaveLength(1)
    expect(json.coupons[0].code).toBe('SAVE10')
    expect(db.coupon.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { merchantId: 'm1' },
    }))
  })
})

describe('POST /api/v1/coupons', () => {
  it('creates the coupon with a normalized code', async () => {
    db.coupon.create.mockResolvedValue(coupon({ code: 'SAVE10' }))

    const res = await createCoupon(req('/api/v1/coupons', {
      method: 'POST',
      body: JSON.stringify({
        code: ' save10 ',
        discount_type: 'percentage',
        discount_value: 10,
      }),
    }))
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.coupon.code).toBe('SAVE10')
    expect(db.coupon.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        merchantId: 'm1',
        code: 'SAVE10',
        discountType: 'percentage',
        discountValue: 10,
      }),
    })
  })

  it('rejects an invalid coupon before touching the database', async () => {
    const res = await createCoupon(req('/api/v1/coupons', {
      method: 'POST',
      body: JSON.stringify({ code: 'X', discount_type: 'percentage', discount_value: 0 }),
    }))
    expect(res.status).toBe(400)
    expect(db.coupon.create).not.toHaveBeenCalled()
  })
})

describe('GET /api/v1/refunds', () => {
  it('lists refunds with the requested filter and limit', async () => {
    const res = await listRefunds(req('/api/v1/refunds?status=pending&limit=25'))
    expect(res.status).toBe(200)
    expect(refunds.listManualRefunds).toHaveBeenCalledWith('m1', { status: 'pending', limit: 25 })
  })
})

describe('POST /api/v1/refunds', () => {
  it('records a refund against a transaction', async () => {
    const res = await createRefund(req('/api/v1/refunds', {
      method: 'POST',
      body: JSON.stringify({ transaction_id: 'TXN1', amount: 50, reason: 'Damaged item' }),
    }))
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.refund.id).toBe('r1')
    expect(refunds.createManualRefund).toHaveBeenCalledWith(expect.objectContaining({
      merchantId: 'm1',
      transactionId: 'TXN1',
      amount: 50,
      reason: 'Damaged item',
      actorUserId: null,
    }))
  })

  it('turns a refund rule error into a 400', async () => {
    refunds.createManualRefund.mockRejectedValue(new Error('Refund cannot exceed the remaining 10.00 for this payment'))

    const res = await createRefund(req('/api/v1/refunds', {
      method: 'POST',
      body: JSON.stringify({ transaction_id: 'TXN1', amount: 50 }),
    }))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/v1/subscriptions', () => {
  it('lists subscriptions with customer and history', async () => {
    const res = await listSubscriptions(req('/api/v1/subscriptions?status=active&limit=25'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.total).toBe(1)
    expect(json.subscriptions[0].plan_name).toBe('Care plan')
    expect(json.subscriptions[0].customer.full_name).toBe('Asha Rao')
    expect(db.subscription.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { merchantId: 'm1', status: 'active' },
      take: 25,
    }))
  })
})

describe('GET /api/v1/loyalty/{customer_id}', () => {
  it('returns the customer balance and ledger', async () => {
    const res = await getLoyalty(req('/api/v1/loyalty/c1'), {
      params: Promise.resolve({ customer_id: 'c1' }),
    })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.customer.full_name).toBe('Asha Rao')
    expect(json.points_balance).toBe(80)
    expect(json.points_awarded).toBe(100)
    expect(json.points_deducted).toBe(20)
    expect(json.entries).toHaveLength(2)
    expect(json.entries[0].reason).toBe('Payment confirmed (TXN1)')
    expect(db.customer.findFirst).toHaveBeenCalledWith({
      where: { id: 'c1', merchantId: 'm1' },
      select: { id: true, fullName: true, phone: true, email: true },
    })
  })

  it('returns 404 for a customer outside the merchant account', async () => {
    db.customer.findFirst.mockResolvedValue(null)
    const res = await getLoyalty(req('/api/v1/loyalty/other'), {
      params: Promise.resolve({ customer_id: 'other' }),
    })
    expect(res.status).toBe(404)
  })
})
