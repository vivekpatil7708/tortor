import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  subscription: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  subscriptionPayment: { findMany: vi.fn(), updateMany: vi.fn() },
  paymentLink: { updateMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

import { cancelSubscriptionByToken } from './subscriptions'

const active = {
  id: 's1',
  merchantId: 'm1',
  customerId: 'c1',
  planName: 'Care plan',
  amount: 499,
  frequency: 'monthly',
  nextBillingDate: new Date('2026-11-10T18:30:00.000Z'),
  status: 'active',
  cancelToken: 'token',
  cancelledAt: null,
  customer: { id: 'c1', fullName: 'Asha Rao', phone: null, email: null },
  merchant: {
    businessName: 'Asha Store',
    email: 'owner@example.com',
    defaultCurrency: 'INR',
    supportEmail: null,
    supportPhone: null,
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  db.subscription.update.mockResolvedValue({ ...active, status: 'cancelled', cancelledAt: new Date() })
  db.subscriptionPayment.findMany.mockResolvedValue([
    { id: 'sp1', paymentLinkId: 'pl1' },
    { id: 'sp2', paymentLinkId: null },
  ])
  db.paymentLink.updateMany.mockResolvedValue({ count: 1 })
  db.subscriptionPayment.updateMany.mockResolvedValue({ count: 2 })
})

describe('customer cancellation link', () => {
  it('cancels the plan and closes its pending payment links', async () => {
    db.subscription.findUnique.mockResolvedValue(active)

    const result = await cancelSubscriptionByToken('token')

    expect(result?.alreadyCancelled).toBe(false)
    expect(db.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 's1' },
      data: expect.objectContaining({ status: 'cancelled' }),
    }))
    expect(db.paymentLink.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['pl1'] }, merchantId: 'm1' },
      data: { status: 'inactive' },
    })
    expect(db.subscriptionPayment.updateMany).toHaveBeenCalledWith({
      where: { subscriptionId: 's1', status: 'pending' },
      data: { status: 'cancelled', failureReason: 'Subscription cancelled' },
    })
  })

  it('is idempotent and never touches an already cancelled plan', async () => {
    db.subscription.findUnique.mockResolvedValue({ ...active, status: 'cancelled' })

    const result = await cancelSubscriptionByToken('token')

    expect(result?.alreadyCancelled).toBe(true)
    expect(db.subscription.update).not.toHaveBeenCalled()
    expect(db.paymentLink.updateMany).not.toHaveBeenCalled()
  })

  it('returns null for an unknown token', async () => {
    db.subscription.findUnique.mockResolvedValue(null)
    expect(await cancelSubscriptionByToken('missing')).toBeNull()
  })
})
