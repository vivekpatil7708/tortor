import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const db = vi.hoisted(() => ({
  merchant: { findUnique: vi.fn(), update: vi.fn() },
  loyaltyPoint: {
    groupBy: vi.fn(),
    findMany: vi.fn(),
    aggregate: vi.fn(),
    create: vi.fn(),
  },
  customer: { findMany: vi.fn(), findFirst: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

const auth = vi.hoisted(() => ({ requireSession: vi.fn() }))
vi.mock('@/lib/auth', () => auth)

import { GET, POST, PUT } from '@/app/api/loyalty/route'

const customer = { id: 'c1', fullName: 'Asha Rao', phone: '9876543210', email: 'asha@example.com' }

const request = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/loyalty', {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

beforeEach(() => {
  vi.clearAllMocks()
  auth.requireSession.mockResolvedValue({
    id: 'm1',
    teamRole: 'owner',
    emailVerifiedAt: new Date(),
  })
  db.merchant.findUnique.mockResolvedValue({ loyaltyPointsPerRupee: 0.1 })
  db.merchant.update.mockResolvedValue({ loyaltyPointsPerRupee: 0.1 })
  db.loyaltyPoint.groupBy.mockResolvedValue([
    { customerId: 'c1', _sum: { points: 100 } },
    { customerId: 'c2', _sum: { points: 20 } },
  ])
  db.loyaltyPoint.findMany.mockResolvedValue([
    {
      id: 'lp1',
      points: 49,
      reason: 'Payment confirmed (TXN123)',
      transactionId: 't1',
      createdAt: new Date('2026-10-28T00:00:00.000Z'),
      customer,
    },
  ])
  db.loyaltyPoint.aggregate.mockResolvedValue({ _sum: { points: 100 } })
  db.customer.findMany.mockResolvedValue([
    customer,
    { id: 'c2', fullName: 'Ravi', phone: null, email: null },
  ])
  db.customer.findFirst.mockResolvedValue({ id: 'c1' })
  db.loyaltyPoint.create.mockResolvedValue({
    id: 'lp2',
    points: 50,
    reason: 'Birthday bonus',
    transactionId: null,
    createdAt: new Date('2026-10-28T01:00:00.000Z'),
    customer,
  })
})

describe('loyalty dashboard API', () => {
  it('returns settings, balances, recent activity and totals', async () => {
    db.loyaltyPoint.aggregate.mockImplementation(async (args: {
      where: { points?: { gt?: number; lt?: number } }
    }) => {
      if (args.where.points?.gt !== undefined) return { _sum: { points: 500 } }
      if (args.where.points?.lt !== undefined) return { _sum: { points: -120 } }
      return { _sum: { points: 380 } }
    })

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.settings.points_per_rupee).toBe(0.1)
    expect(body.totals).toEqual({ balance: 380, awarded: 500, deducted: 120 })
    expect(body.customers).toEqual([
      expect.objectContaining({ id: 'c1', balance: 100 }),
      expect.objectContaining({ id: 'c2', balance: 20 }),
    ])
    expect(body.entries[0]).toEqual(expect.objectContaining({
      points: 49,
      customer: expect.objectContaining({ full_name: 'Asha Rao' }),
    }))
  })

  it('saves the earning rate for the owner', async () => {
    const res = await PUT(request('PUT', { points_per_rupee: 0.1 }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(db.merchant.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { loyaltyPointsPerRupee: 0.1 },
      select: { loyaltyPointsPerRupee: true },
    })
    expect(body.settings.points_per_rupee).toBe(0.1)
  })

  it('rejects a negative earning rate', async () => {
    const res = await PUT(request('PUT', { points_per_rupee: -1 }))
    expect(res.status).toBe(400)
    expect(db.merchant.update).not.toHaveBeenCalled()
  })

  it('awards manual points and returns the new balance', async () => {
    const res = await POST(request('POST', { customer_id: 'c1', points: 50, reason: 'Birthday bonus' }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(db.customer.findFirst).toHaveBeenCalledWith({
      where: { id: 'c1', merchantId: 'm1' },
      select: { id: true },
    })
    expect(db.loyaltyPoint.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { merchantId: 'm1', customerId: 'c1', points: 50, reason: 'Birthday bonus' },
    }))
    expect(body.balance).toBe(150)
  })

  it('will not deduct more points than the customer has', async () => {
    const res = await POST(request('POST', { customer_id: 'c1', points: -200, reason: 'Correction' }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('only has 100 points')
    expect(db.loyaltyPoint.create).not.toHaveBeenCalled()
  })

  it('requires a verified email for a manual adjustment', async () => {
    auth.requireSession.mockResolvedValue({ id: 'm1', teamRole: 'owner', emailVerifiedAt: null })

    const res = await POST(request('POST', { customer_id: 'c1', points: 50, reason: 'Bonus' }))
    expect(res.status).toBe(403)
  })
})
