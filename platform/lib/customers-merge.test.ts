import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Merging duplicate customers: a duplicate's history is moved onto the survivor
// before the empty row is removed. Nothing belonging to another merchant is touched.
const db = vi.hoisted(() => ({
  customer: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  order: { updateMany: vi.fn(), aggregate: vi.fn() },
  customerAddress: { updateMany: vi.fn() },
  messageLog: { updateMany: vi.fn() },
  returnRequest: { updateMany: vi.fn() },
  followUpTask: { updateMany: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

const auth = vi.hoisted(() => ({ requireSession: vi.fn() }))
vi.mock('@/lib/auth', () => auth)

import { POST as mergeCustomers } from '@/app/api/customers/merge/route'

const request = (body: unknown) =>
  new NextRequest('http://localhost/api/customers/merge', { method: 'POST', body: JSON.stringify(body) })

beforeEach(() => {
  vi.clearAllMocks()
  auth.requireSession.mockResolvedValue({ id: 'm1', emailVerifiedAt: new Date() })
  db.customer.findFirst.mockResolvedValue({ id: 'keep' })
  db.customer.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
    where.id.in.map(id => ({ id }))
  )
  db.order.aggregate.mockResolvedValue({ _count: { id: 3 }, _sum: { totalAmount: { toNumber: () => 4500 } }, _max: { createdAt: new Date('2026-10-02T00:00:00Z') } })
  // Run the transaction callback against the same mocked client.
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db))
})

afterEach(() => vi.restoreAllMocks())

describe('merging customers', () => {
  it('moves the duplicates\' orders and addresses onto the survivor', async () => {
    const res = await mergeCustomers(request({ targetId: 'keep', sourceIds: ['dup1', 'dup2'] }))
    expect(res.status).toBe(200)
    expect((await res.json()).merged).toBe(2)

    expect(db.order.updateMany).toHaveBeenCalledWith({
      where: { customerId: { in: ['dup1', 'dup2'] }, merchantId: 'm1' },
      data: { customerId: 'keep' },
    })
    expect(db.customerAddress.updateMany).toHaveBeenCalledWith({
      where: { customerId: { in: ['dup1', 'dup2'] }, merchantId: 'm1' },
      data: { customerId: 'keep' },
    })
  })

  it('moves messages, returns and follow-ups too', async () => {
    await mergeCustomers(request({ targetId: 'keep', sourceIds: ['dup1'] }))
    for (const model of [db.messageLog, db.returnRequest, db.followUpTask]) {
      expect(model.updateMany).toHaveBeenCalledWith({
        where: { customerId: { in: ['dup1'] }, merchantId: 'm1' },
        data: { customerId: 'keep' },
      })
    }
  })

  it('removes the emptied duplicate rows', async () => {
    await mergeCustomers(request({ targetId: 'keep', sourceIds: ['dup1', 'dup2'] }))
    expect(db.customer.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['dup1', 'dup2'] }, merchantId: 'm1' } })
  })

  it('recomputes the survivor\'s totals from the orders it now owns', async () => {
    await mergeCustomers(request({ targetId: 'keep', sourceIds: ['dup1'] }))
    expect(db.order.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: { merchantId: 'm1', customerId: 'keep', orderStatus: { not: 'cancelled' } },
    }))
    expect(db.customer.update).toHaveBeenCalledWith({
      where: { id: 'keep' },
      data: { totalOrders: 3, totalSpent: 4500, lastOrderAt: new Date('2026-10-02T00:00:00Z') },
    })
  })

  it('ignores a duplicate that is the same as the survivor', async () => {
    const res = await mergeCustomers(request({ targetId: 'keep', sourceIds: ['keep'] }))
    expect(res.status).toBe(400)
    expect(db.order.updateMany).not.toHaveBeenCalled()
  })

  it('de-duplicates the list of duplicates', async () => {
    const res = await mergeCustomers(request({ targetId: 'keep', sourceIds: ['dup1', 'dup1', 'dup1'] }))
    expect((await res.json()).merged).toBe(1)
  })

  it('needs a customer to keep', async () => {
    expect((await mergeCustomers(request({ sourceIds: ['dup1'] }))).status).toBe(400)
  })

  it('refuses when the survivor is not yours', async () => {
    db.customer.findFirst.mockResolvedValue(null)
    const res = await mergeCustomers(request({ targetId: 'someone-elses', sourceIds: ['dup1'] }))
    expect(res.status).toBe(404)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('refuses when a duplicate is not yours, and changes nothing', async () => {
    // Only one of the two ids comes back as owned.
    db.customer.findMany.mockResolvedValue([{ id: 'dup1' }])
    const res = await mergeCustomers(request({ targetId: 'keep', sourceIds: ['dup1', 'not-mine'] }))
    expect(res.status).toBe(404)
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(db.customer.deleteMany).not.toHaveBeenCalled()
  })

  it('caps how many can be merged at once', async () => {
    const many = Array.from({ length: 51 }, (_, i) => `dup${i}`)
    expect((await mergeCustomers(request({ targetId: 'keep', sourceIds: many }))).status).toBe(400)
  })
})
