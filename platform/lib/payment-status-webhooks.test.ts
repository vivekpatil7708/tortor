import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  transaction: { findUnique: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

const webhooks = vi.hoisted(() => ({ dispatchMerchantWebhook: vi.fn() }))
vi.mock('@/lib/webhook-delivery', () => webhooks)

import { notifyPaymentStatus } from '@/lib/webhooks'

function transactionRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'txn1',
    txnId: 'TP-TXN-1',
    merchantId: 'm1',
    amount: 1499,
    status: 'success',
    customerName: 'Asha Rao',
    customerPhone: '9876543210',
    customerEmail: 'asha@example.com',
    paymentApp: 'Google Pay',
    paymentLinkId: 'pl1',
    paymentLink: { webhookUrl: null, title: 'October invoice' },
    merchant: { settings: null },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  webhooks.dispatchMerchantWebhook.mockResolvedValue([])
})

describe('payment status webhook triggers', () => {
  it('emits payment.confirmed when a payment link transaction succeeds', async () => {
    db.transaction.findUnique.mockResolvedValue(transactionRow())

    await notifyPaymentStatus('txn1', 'success')

    expect(webhooks.dispatchMerchantWebhook).toHaveBeenCalledWith({
      merchantId: 'm1',
      mode: 'live',
      eventType: 'payment.confirmed',
      data: expect.objectContaining({
        transaction_id: 'txn1',
        txn_id: 'TP-TXN-1',
        amount: 1499,
        status: 'success',
        link_id: 'pl1',
        link_title: 'October invoice',
      }),
    })
  })

  it('emits payment.rejected when a payment link transaction fails', async () => {
    db.transaction.findUnique.mockResolvedValue(transactionRow({ status: 'failed' }))

    await notifyPaymentStatus('txn1', 'failed')

    expect(webhooks.dispatchMerchantWebhook).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'payment.rejected',
      data: expect.objectContaining({ status: 'failed' }),
    }))
  })

  it('does not emit a confirmed/rejected event for a pending status', async () => {
    db.transaction.findUnique.mockResolvedValue(transactionRow({ status: 'pending' }))

    await notifyPaymentStatus('txn1', 'pending')

    expect(webhooks.dispatchMerchantWebhook).not.toHaveBeenCalled()
  })

  it('does nothing when the transaction no longer exists', async () => {
    db.transaction.findUnique.mockResolvedValue(null)

    await notifyPaymentStatus('missing', 'success')

    expect(webhooks.dispatchMerchantWebhook).not.toHaveBeenCalled()
  })
})
