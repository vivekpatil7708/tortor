import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// The payment-link status route (PATCH /api/transactions/[txnId]) with the
// database, login and webhooks replaced by fakes.
const db = vi.hoisted(() => ({
  transaction: { findUnique: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
  paymentLink: { findUnique: vi.fn() },
}))
const notifyPaymentStatus = vi.hoisted(() => vi.fn())
const logAudit = vi.hoisted(() => vi.fn())
const queuePaidClaimAlert = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ id: 'merchant-1' })) }))
vi.mock('@/lib/webhooks', () => ({ notifyPaymentStatus }))
vi.mock('@/lib/audit', () => ({ logAudit }))
vi.mock('@/lib/payment-alerts', () => ({ queuePaidClaimAlert }))

import { PATCH } from '@/app/api/transactions/[txnId]/route'

function txn(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1', merchantId: 'merchant-1', paymentLinkId: null, txnId: 'TXN1', upiTxnId: null, amount: 500,
    customerName: 'Asha', customerPhone: null, customerEmail: null, customerNote: null, customFieldValues: '{}',
    status: 'pending', settlementStatus: 'pending', settlementAmount: null, settlementDate: null,
    paymentApp: null, payerVpa: null, upiPaymentRef: null, errorMessage: null, ipAddress: null, userAgent: null,
    confirmedAt: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }
}

async function patch(body: Record<string, unknown>) {
  const req = new NextRequest('http://localhost/api/transactions/TXN1', { method: 'PATCH', body: JSON.stringify(body) })
  const res = await PATCH(req, { params: Promise.resolve({ txnId: 'TXN1' }) })
  return { status: res.status, json: await res.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  db.transaction.updateMany.mockResolvedValue({ count: 1 })
})

describe('PATCH /api/transactions/[txnId]', () => {
  it('confirms a pending payment once and tells the website', async () => {
    db.transaction.findUnique.mockResolvedValue(txn())
    db.transaction.findUniqueOrThrow.mockResolvedValue(txn({ status: 'success' }))

    const res = await patch({ status: 'success', merchant_action: true })

    expect(res.status).toBe(200)
    expect(db.transaction.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { txnId: 'TXN1', status: 'pending' },
      data: expect.objectContaining({ status: 'success', settlementStatus: 'settled' }),
    }))
    expect(notifyPaymentStatus).toHaveBeenCalledTimes(1)
    expect(notifyPaymentStatus).toHaveBeenCalledWith('t1', 'success')
  })

  it('a repeat confirm changes nothing and sends no webhook', async () => {
    db.transaction.findUnique.mockResolvedValue(txn({ status: 'success', confirmedAt: new Date() }))

    const res = await patch({ status: 'success', merchant_action: true })

    expect(res.status).toBe(200)
    expect(db.transaction.updateMany).not.toHaveBeenCalled()
    expect(notifyPaymentStatus).not.toHaveBeenCalled()
  })

  it('undo within 30 minutes marks it failed, clears settlement and is audited', async () => {
    db.transaction.findUnique.mockResolvedValue(txn({ status: 'success', settlementStatus: 'settled', confirmedAt: new Date(Date.now() - 10 * 60_000) }))
    db.transaction.findUniqueOrThrow.mockResolvedValue(txn({ status: 'failed' }))

    const res = await patch({ status: 'failed', merchant_action: true })

    expect(res.status).toBe(200)
    expect(db.transaction.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { txnId: 'TXN1', status: 'success' },
      data: expect.objectContaining({ status: 'failed', settlementStatus: 'pending', settlementAmount: null }),
    }))
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'payment_confirmation_undone' }))
    expect(notifyPaymentStatus).toHaveBeenCalledWith('t1', 'failed')
  })

  it('refuses an undo after 30 minutes', async () => {
    db.transaction.findUnique.mockResolvedValue(txn({ status: 'success', confirmedAt: new Date(Date.now() - 31 * 60_000) }))

    const res = await patch({ status: 'failed', merchant_action: true })

    expect(res.status).toBe(409)
    expect(db.transaction.updateMany).not.toHaveBeenCalled()
    expect(notifyPaymentStatus).not.toHaveBeenCalled()
  })

  it('a customer cannot reopen a settled payment', async () => {
    db.transaction.findUnique.mockResolvedValue(txn({ status: 'success' }))

    const res = await patch({ status: 'pending' })

    expect(res.status).toBe(409)
    expect(res.json.error).toBe('Transaction already finalized')
    expect(notifyPaymentStatus).not.toHaveBeenCalled()
  })

  it('a customer marking an open payment as sent notifies once; tapping again does nothing', async () => {
    db.transaction.findUnique.mockResolvedValue(txn({ status: 'initiated' }))
    db.transaction.findUniqueOrThrow.mockResolvedValue(txn({ status: 'pending' }))
    expect((await patch({ status: 'pending' })).status).toBe(200)
    expect(notifyPaymentStatus).toHaveBeenCalledWith('t1', 'pending')
    // B9: the merchant's alert email is queued once, for the saved claim.
    expect(queuePaidClaimAlert).toHaveBeenCalledTimes(1)
    expect(queuePaidClaimAlert).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', status: 'pending' }))

    vi.clearAllMocks()
    db.transaction.findUnique.mockResolvedValue(txn({ status: 'pending' }))
    expect((await patch({ status: 'pending' })).status).toBe(200)
    expect(db.transaction.updateMany).not.toHaveBeenCalled()
    expect(notifyPaymentStatus).not.toHaveBeenCalled()
    expect(queuePaidClaimAlert).not.toHaveBeenCalled()
  })

  it("never sends a payment alert for the merchant's own confirm or reject", async () => {
    db.transaction.findUnique.mockResolvedValue(txn())
    db.transaction.findUniqueOrThrow.mockResolvedValue(txn({ status: 'success' }))

    await patch({ status: 'success', merchant_action: true })

    expect(queuePaidClaimAlert).not.toHaveBeenCalled()
  })

  it('when two updates race, the one that loses gets a conflict and sends nothing', async () => {
    db.transaction.findUnique.mockResolvedValue(txn())
    db.transaction.updateMany.mockResolvedValue({ count: 0 })

    const res = await patch({ status: 'failed', merchant_action: true })

    expect(res.status).toBe(409)
    expect(notifyPaymentStatus).not.toHaveBeenCalled()
  })
})
