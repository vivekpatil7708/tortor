import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  subscriptionPayment: { findUnique: vi.fn(), update: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

import { syncSubscriptionPaymentFromTransaction } from './subscription-payments'

const txn = { id: 't1', merchantId: 'm1', paymentLinkId: 'pl1' }

beforeEach(() => {
  vi.clearAllMocks()
  db.subscriptionPayment.findUnique.mockResolvedValue({
    id: 'sp1',
    merchantId: 'm1',
    status: 'pending',
  })
  db.subscriptionPayment.update.mockResolvedValue({})
})

describe('subscription payment history', () => {
  it('marks the matching history row paid when the merchant confirms', async () => {
    await syncSubscriptionPaymentFromTransaction(txn, 'success')

    expect(db.subscriptionPayment.findUnique).toHaveBeenCalledWith({ where: { paymentLinkId: 'pl1' } })
    expect(db.subscriptionPayment.update).toHaveBeenCalledWith({
      where: { id: 'sp1' },
      data: expect.objectContaining({
        status: 'paid',
        transactionId: 't1',
        failureReason: null,
        paidAt: expect.any(Date),
      }),
    })
  })

  it('marks a rejected payment failed but keeps the transaction attached', async () => {
    await syncSubscriptionPaymentFromTransaction(txn, 'failed')

    expect(db.subscriptionPayment.update).toHaveBeenCalledWith({
      where: { id: 'sp1' },
      data: expect.objectContaining({
        status: 'failed',
        transactionId: 't1',
        paidAt: null,
        failureReason: 'Payment was not confirmed',
      }),
    })
  })

  it('ignores ordinary payment-link transactions', async () => {
    const result = await syncSubscriptionPaymentFromTransaction(
      { id: 't1', merchantId: 'm1', paymentLinkId: null },
      'success',
    )

    expect(result).toBeNull()
    expect(db.subscriptionPayment.findUnique).not.toHaveBeenCalled()
  })

  it('never updates a row owned by another merchant', async () => {
    db.subscriptionPayment.findUnique.mockResolvedValue({
      id: 'sp1',
      merchantId: 'other',
      status: 'pending',
    })

    const result = await syncSubscriptionPaymentFromTransaction(txn, 'success')

    expect(result).toBeNull()
    expect(db.subscriptionPayment.update).not.toHaveBeenCalled()
  })
})
