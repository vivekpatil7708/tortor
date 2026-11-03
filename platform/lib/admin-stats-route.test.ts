import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  merchant: { count: vi.fn(), findMany: vi.fn() },
  transaction: { count: vi.fn(), aggregate: vi.fn() },
  pageView: { count: vi.fn(), groupBy: vi.fn() },
  messageLog: { count: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: vi.fn(async () => ({ id: 'admin-id' })),
}))

import { GET } from '@/app/api/admin/stats/route'

beforeEach(() => {
  vi.clearAllMocks()
  db.merchant.count.mockResolvedValue(4)
  db.merchant.findMany.mockResolvedValue([])
  db.transaction.count.mockResolvedValue(10)
  db.transaction.aggregate.mockImplementation(async (args: { where?: { status?: string; createdAt?: unknown } }) => {
    if (args.where?.status === 'success' && args.where.createdAt) return { _sum: { amount: 25 } }
    if (args.where?.status === 'success') return { _sum: { amount: 100 } }
    return { _sum: { amount: 175 } }
  })
  db.pageView.count.mockResolvedValue(0)
  db.pageView.groupBy.mockResolvedValue([])
  db.messageLog.count.mockResolvedValue(0)
})

describe('GET /api/admin/stats', () => {
  it('reports the total value of every transaction alongside successful revenue', async () => {
    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.total_transactions).toBe(10)
    expect(json.total_transaction_amount).toBe(175)
    expect(json.total_revenue).toBe(100)
    expect(db.transaction.aggregate).toHaveBeenCalledWith({ _sum: { amount: true } })
  })
})
