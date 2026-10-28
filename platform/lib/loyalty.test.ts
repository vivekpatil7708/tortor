import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  loyaltyPoint: {
    findUnique: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
    aggregate: vi.fn(),
  },
  merchant: { findUnique: vi.fn() },
  customer: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

import {
  awardLoyaltyPointsForTransaction,
  findOrCreateLoyaltyCustomer,
  loyaltyBalance,
  reverseLoyaltyPointsForTransaction,
} from './loyalty'

const txn = {
  id: 't1',
  merchantId: 'm1',
  txnId: 'TXN123',
  amount: 499,
  customerName: 'Asha Rao',
  customerPhone: '9876543210',
  customerEmail: 'ASHA@example.com',
}

beforeEach(() => {
  vi.clearAllMocks()
  db.loyaltyPoint.findUnique.mockResolvedValue(null)
  db.merchant.findUnique.mockResolvedValue({ loyaltyPointsPerRupee: 0.1 })
  db.customer.findFirst.mockResolvedValue({
    id: 'c1',
    merchantId: 'm1',
    fullName: 'Asha Rao',
    phone: '9876543210',
    email: 'asha@example.com',
  })
  db.customer.create.mockResolvedValue({ id: 'new', merchantId: 'm1', fullName: 'Asha Rao' })
  db.customer.update.mockResolvedValue({ id: 'c1', merchantId: 'm1', fullName: 'Asha Rao' })
  db.loyaltyPoint.create.mockResolvedValue({ id: 'lp1', points: 49, transactionId: 't1' })
  db.loyaltyPoint.deleteMany.mockResolvedValue({ count: 1 })
  db.loyaltyPoint.aggregate.mockResolvedValue({ _sum: { points: 49 } })
})

describe('automatic loyalty points', () => {
  it('awards points once for a confirmed payment', async () => {
    const entry = await awardLoyaltyPointsForTransaction(txn)

    expect(entry).toEqual(expect.objectContaining({ points: 49 }))
    expect(db.loyaltyPoint.findUnique).toHaveBeenCalledWith({ where: { transactionId: 't1' } })
    expect(db.customer.findFirst).toHaveBeenCalledWith({
      where: { merchantId: 'm1', phone: '9876543210' },
    })
    expect(db.loyaltyPoint.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        merchantId: 'm1',
        customerId: 'c1',
        points: 49,
        transactionId: 't1',
        reason: expect.stringContaining('TXN123'),
      }),
    })
  })

  it('does not award twice or touch customers when earning is off', async () => {
    db.loyaltyPoint.findUnique.mockResolvedValue({ id: 'lp1', points: 49 })
    expect(await awardLoyaltyPointsForTransaction(txn)).toEqual(expect.objectContaining({ id: 'lp1' }))
    expect(db.loyaltyPoint.create).not.toHaveBeenCalled()

    vi.clearAllMocks()
    db.loyaltyPoint.findUnique.mockResolvedValue(null)
    db.merchant.findUnique.mockResolvedValue({ loyaltyPointsPerRupee: 0 })
    expect(await awardLoyaltyPointsForTransaction(txn)).toBeNull()
    expect(db.customer.findFirst).not.toHaveBeenCalled()
  })

  it('creates a customer when the payment has a phone but no saved customer', async () => {
    db.customer.findFirst.mockResolvedValue(null)
    db.loyaltyPoint.create.mockResolvedValue({ id: 'lp2', points: 49 })

    await awardLoyaltyPointsForTransaction(txn)

    expect(db.customer.create).toHaveBeenCalledWith({
      data: {
        merchantId: 'm1',
        fullName: 'Asha Rao',
        phone: '9876543210',
        email: 'asha@example.com',
      },
    })
  })

  it('has nowhere to put points when the payment has no contact', async () => {
    const anonymous = { ...txn, customerPhone: null, customerEmail: null }
    expect(await findOrCreateLoyaltyCustomer(anonymous)).toBeNull()
    expect(db.customer.findFirst).not.toHaveBeenCalled()
  })

  it('removes the award when a confirmation is undone', async () => {
    expect(await reverseLoyaltyPointsForTransaction('t1')).toBe(1)
    expect(db.loyaltyPoint.deleteMany).toHaveBeenCalledWith({ where: { transactionId: 't1' } })
  })

  it('sums the ledger for a balance', async () => {
    expect(await loyaltyBalance('m1', 'c1')).toBe(49)
    expect(db.loyaltyPoint.aggregate).toHaveBeenCalledWith({
      where: { merchantId: 'm1', customerId: 'c1' },
      _sum: { points: true },
    })
  })
})
