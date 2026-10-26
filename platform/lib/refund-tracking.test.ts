import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'

const db = vi.hoisted(() => ({
  refund: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    aggregate: vi.fn(),
  },
  order: { findFirst: vi.fn() },
  transaction: { findFirst: vi.fn() },
  merchant: { findUnique: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

const logAudit = vi.hoisted(() => vi.fn())
vi.mock('@/lib/audit', () => ({ logAudit }))

const sendMessage = vi.hoisted(() => vi.fn())
vi.mock('@/lib/messaging/engine', () => ({ sendMessage }))

const credentials = vi.hoisted(() => ({ value: { credentials: null as Record<string, unknown> | null } }))
vi.mock('@/lib/messaging/connections', () => ({
  getChannelCredentials: vi.fn(async () => credentials.value),
}))
vi.mock('@/lib/messaging/openwa', () => ({ isOpenWaConfigured: vi.fn(() => false) }))

import {
  createManualRefund,
  markRefundProcessed,
  refundDisplayStatus,
} from '@/lib/refund-tracking'

const transaction = {
  id: 't1',
  txnId: 'TXN1',
  amount: 500,
  status: 'success',
  customerName: 'Asha',
  customerEmail: 'asha@example.com',
  customerPhone: '+919876543210',
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    merchantId: 'm1',
    orderId: 'o1',
    paymentId: 'p1',
    transactionId: 't1',
    returnId: null,
    refundNumber: 'REF-2026-ABCD',
    amount: new Prisma.Decimal(100),
    currency: 'INR',
    status: 'pending',
    providerRefundId: null,
    failureReason: null,
    reason: 'Damaged item',
    initiatedAt: null,
    completedAt: null,
    createdAt: new Date('2026-10-27T05:00:00.000Z'),
    updatedAt: new Date('2026-10-27T05:00:00.000Z'),
    order: {
      id: 'o1',
      orderNumber: 'TP-2026-ABCD',
      totalAmount: new Prisma.Decimal(500),
      currency: 'INR',
      customer: { fullName: 'Asha', email: 'asha@example.com', phone: '+919876543210' },
    },
    payment: { id: 'p1', paymentReference: 'TPPAY-1', provider: 'upi', status: 'paid' },
    transaction,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  credentials.value = { credentials: null }
  logAudit.mockResolvedValue(undefined)
  sendMessage.mockImplementation(async (params: { channel: string }) => ({
    channel: params.channel,
    status: 'sent',
  }))
  db.refund.findFirst.mockResolvedValue(null)
  db.refund.findMany.mockResolvedValue([])
  db.refund.aggregate.mockResolvedValue({ _sum: { amount: null } })
  db.merchant.findUnique.mockResolvedValue({
    businessName: 'Asha Crafts',
    supportEmail: 'help@ashacrafts.in',
    supportPhone: '+919876543210',
  })
})

describe('manual refund status', () => {
  it('shows both the old provider completion and the manual processed state as processed', () => {
    expect(refundDisplayStatus('pending')).toBe('pending')
    expect(refundDisplayStatus('initiated')).toBe('pending')
    expect(refundDisplayStatus('processed')).toBe('processed')
    expect(refundDisplayStatus('completed')).toBe('processed')
    expect(refundDisplayStatus('failed')).toBe('failed')
  })
})

describe('recording a manual refund', () => {
  it('records a pending refund against a successful payment', async () => {
    db.transaction.findFirst.mockResolvedValue(transaction)
    db.refund.create.mockImplementation(async () => row({ amount: new Prisma.Decimal(200), status: 'pending' }))

    const refund = await createManualRefund({
      merchantId: 'm1',
      transactionId: 'TXN1',
      amount: 200,
      reason: 'Customer returned the item',
      actorUserId: 'a1',
    })

    const data = db.refund.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      merchantId: 'm1',
      transactionId: 't1',
      refundNumber: expect.stringMatching(/^REF-\d{4}-[A-Z0-9]{4}$/),
      status: 'pending',
      reason: 'Customer returned the item',
    })
    expect(data.amount.toNumber()).toBe(200)
    expect(refund).toMatchObject({
      status: 'pending',
      transaction_id: 't1',
      transaction_ref: 'TXN1',
      amount: 200,
    })
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'refund_created',
      entityType: 'refund',
      entityId: 'r1',
    }))
  })

  it('refuses to refund more than is left after earlier refunds', async () => {
    db.transaction.findFirst.mockResolvedValue(transaction)
    db.refund.findMany.mockResolvedValue([{ amount: new Prisma.Decimal(400) }])

    await expect(createManualRefund({
      merchantId: 'm1',
      transactionId: 'TXN1',
      amount: 200,
    })).rejects.toThrow('Refund cannot exceed the remaining 100.00 for this payment')

    expect(db.refund.create).not.toHaveBeenCalled()
  })

  it('refuses an amount smaller than one paisa after rounding', async () => {
    db.transaction.findFirst.mockResolvedValue(transaction)

    await expect(createManualRefund({
      merchantId: 'm1',
      transactionId: 'TXN1',
      amount: 0.001,
    })).rejects.toThrow('Refund amount must be at least 0.01')

    expect(db.refund.create).not.toHaveBeenCalled()
  })

  it('records a refund against a paid order using its latest paid payment', async () => {
    db.order.findFirst.mockResolvedValue({
      id: 'o1',
      totalAmount: new Prisma.Decimal(500),
      currency: 'INR',
      paymentStatus: 'paid',
      customer: { fullName: 'Asha', email: 'asha@example.com', phone: '+919876543210' },
      payments: [{ id: 'p1', currency: 'INR', status: 'paid' }],
    })
    db.refund.create.mockImplementation(async () =>
      row({ transactionId: null, transaction: null, amount: new Prisma.Decimal(100) })
    )

    await createManualRefund({ merchantId: 'm1', orderId: 'o1', amount: 100, reason: 'Returned' })

    expect(db.refund.create.mock.calls[0][0].data).toMatchObject({
      merchantId: 'm1',
      orderId: 'o1',
      paymentId: 'p1',
      transactionId: null,
      status: 'pending',
    })
  })

  it('refuses an unpaid order', async () => {
    db.order.findFirst.mockResolvedValue({
      id: 'o1',
      totalAmount: new Prisma.Decimal(500),
      currency: 'INR',
      paymentStatus: 'pending',
      customer: null,
      payments: [],
    })

    await expect(createManualRefund({
      merchantId: 'm1',
      orderId: 'o1',
      amount: 100,
    })).rejects.toThrow('Only a paid order can be refunded')

    expect(db.refund.create).not.toHaveBeenCalled()
  })

  it('refuses a payment that was never received', async () => {
    db.transaction.findFirst.mockResolvedValue({ ...transaction, status: 'pending' })

    await expect(createManualRefund({
      merchantId: 'm1',
      transactionId: 'TXN1',
      amount: 100,
    })).rejects.toThrow('Only a payment received from the customer can be refunded')
  })
})

describe('marking a refund processed', () => {
  it('updates the refund and emails the customer', async () => {
    db.refund.findFirst.mockResolvedValue(row())
    db.refund.update.mockResolvedValue(row({ status: 'processed', completedAt: new Date('2026-10-27T06:00:00.000Z') }))

    const result = await markRefundProcessed({ merchantId: 'm1', refundId: 'r1', actorUserId: 'a1' })

    expect(db.refund.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'r1' },
      data: expect.objectContaining({ status: 'processed', failureReason: null }),
    }))
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      merchantId: 'm1',
      channel: 'email',
      eventType: 'refund_completed',
      to: 'asha@example.com',
      idempotencyKey: 'refund_r1_processed_email',
    }))
    expect(result.refund).toMatchObject({ status: 'processed', processed_at: '2026-10-27T06:00:00.000Z' })
    expect(result.notifications).toEqual([{ channel: 'email', status: 'sent' }])
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'refund_processed' }))
  })

  it('also sends WhatsApp when the merchant has a WhatsApp sender connected', async () => {
    credentials.value = { credentials: { accessToken: 'connected' } }
    db.refund.findFirst.mockResolvedValue(row())
    db.refund.update.mockResolvedValue(row({ status: 'processed', completedAt: new Date() }))

    const result = await markRefundProcessed({ merchantId: 'm1', refundId: 'r1' })

    expect(result.notifications).toEqual([
      { channel: 'email', status: 'sent' },
      { channel: 'whatsapp', status: 'sent' },
    ])
  })

  it('does not send a second notification when it is already processed', async () => {
    db.refund.findFirst.mockResolvedValue(row({ status: 'processed' }))

    const result = await markRefundProcessed({ merchantId: 'm1', refundId: 'r1' })

    expect(db.refund.update).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
    expect(result.notifications).toEqual([])
  })
})
