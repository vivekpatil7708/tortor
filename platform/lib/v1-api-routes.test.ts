import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-pepper'

// The v1 API-key routes with the database, auth and webhooks replaced by fakes.
const db = vi.hoisted(() => ({
  apiKey: { findMany: vi.fn() },
  transaction: {
    findMany: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    updateMany: vi.fn(),
    groupBy: vi.fn(),
  },
  paymentLink: { findMany: vi.fn(), groupBy: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  upiId: { findFirst: vi.fn() },
  apiRequestLog: { create: vi.fn() },
}))
const notifyPaymentStatus = vi.hoisted(() => vi.fn())
const logAudit = vi.hoisted(() => vi.fn())
const queuePaidClaimAlert = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/webhooks', () => ({ notifyPaymentStatus }))
vi.mock('@/lib/audit', () => ({ logAudit }))
vi.mock('@/lib/payment-alerts', () => ({ queuePaidClaimAlert }))

// authenticateApiKey: a read+write key for merchant m1 in test mode.
vi.mock('@/lib/api-key', () => ({
  authenticateApiKey: vi.fn(async () => ({
    apiKeyId: 'k1',
    merchantId: 'm1',
    mode: 'test',
    scopes: ['read', 'write'],
  })),
}))

import { GET as listTransactions } from '@/app/api/v1/transactions/route'
import { GET as listLinks, POST as createLink } from '@/app/api/v1/links/route'
import { GET as analytics } from '@/app/api/v1/analytics/route'
import { POST as confirm } from '@/app/api/v1/transactions/[id]/confirm/route'
import { POST as reject } from '@/app/api/v1/transactions/[id]/reject/route'

function req(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`http://localhost${path}`, init)
}

function txn(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1', merchantId: 'm1', paymentLinkId: null, txnId: 'TXN1', upiTxnId: null, amount: 500,
    customerName: 'Asha', customerPhone: null, customerEmail: null, customerNote: null, customFieldValues: '{}',
    status: 'pending', settlementStatus: 'pending', settlementAmount: null, settlementDate: null,
    paymentApp: null, payerVpa: null, upiPaymentRef: null, errorMessage: null, ipAddress: null, userAgent: null,
    confirmedAt: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  db.apiRequestLog.create.mockResolvedValue({})
  db.transaction.updateMany.mockResolvedValue({ count: 1 })
})

describe('GET /api/v1/transactions', () => {
  it('lists the merchant transactions with cursor paging', async () => {
    db.transaction.findMany.mockResolvedValue([txn(), txn({ id: 't2', txnId: 'TXN2' })])
    db.transaction.count.mockResolvedValue(2)

    const res = await listTransactions(req('/api/v1/transactions?status=pending&limit=50'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.total).toBe(2)
    expect(json.transactions).toHaveLength(2)
    expect(json.transactions[0].txn_id).toBe('TXN1')
    expect(db.transaction.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { merchantId: 'm1', status: 'pending' },
      take: 51,
    }))
  })

  it('rejects an unknown status with 400', async () => {
    const res = await listTransactions(req('/api/v1/transactions?status=nope'))
    expect(res.status).toBe(400)
    expect(db.transaction.findMany).not.toHaveBeenCalled()
  })
})

describe('GET /api/v1/links', () => {
  it('lists links with paid totals for the merchant', async () => {
    db.paymentLink.findMany.mockResolvedValue([{ id: 'l1', merchantId: 'm1', amount: 500, customFields: '[]', createdAt: new Date(), updatedAt: new Date() }])
    db.transaction.groupBy.mockResolvedValue([])

    const res = await listLinks(req('/api/v1/links'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toHaveLength(1)
    expect(json[0].id).toBe('l1')
    expect(json[0].paid_count).toBe(0)
  })
})

describe('POST /api/v1/links', () => {
  it('creates a link into a saved UPI ID and returns 201', async () => {
    db.upiId.findFirst.mockResolvedValue({ id: 'u1', merchantId: 'm1', vpa: 'shop@okaxis' })
    db.paymentLink.create.mockResolvedValue({
      id: 'l1', merchantId: 'm1', upiId: 'shop@okaxis', title: 'Test', description: null,
      amount: 100, amountFlexible: false, minAmount: null, maxAmount: null, customFields: '[]',
      expiryAt: null, maxUses: null, useCount: 0, buttonText: null, redirectUrl: null, webhookUrl: null,
      slug: 'test-slug', status: 'active', createdAt: new Date(), updatedAt: new Date(),
    })

    const res = await createLink(req('/api/v1/links', { method: 'POST', body: JSON.stringify({ title: 'Test', upi_id: 'shop@okaxis', amount: 100 }) }))
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.success).toBe(true)
    expect(json.link.id).toBe('l1')
    expect(db.paymentLink.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ merchantId: 'm1', upiId: 'shop@okaxis', amount: 100 }),
    }))
  })

  it('refuses a UPI ID the merchant has not saved', async () => {
    db.upiId.findFirst.mockResolvedValue(null)

    const res = await createLink(req('/api/v1/links', { method: 'POST', body: JSON.stringify({ title: 'Test', upi_id: 'stranger@upi' }) }))

    expect(res.status).toBe(400)
    expect(db.paymentLink.create).not.toHaveBeenCalled()
  })

  it('requires a title and UPI ID', async () => {
    const res = await createLink(req('/api/v1/links', { method: 'POST', body: JSON.stringify({}) }))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/v1/analytics', () => {
  it('returns the summary counted in the database', async () => {
    db.transaction.groupBy.mockResolvedValue([
      { status: 'success', _count: { _all: 2 }, _sum: { amount: 1000 } },
      { status: 'failed', _count: { _all: 1 }, _sum: { amount: 500 } },
    ])
    db.transaction.count.mockResolvedValue(1)

    const res = await analytics(req('/api/v1/analytics'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.successful_payments).toBe(2)
    expect(json.failed_payments).toBe(1)
    expect(json.gross_payment_volume).toBe(1000)
  })

  it('rejects malformed dates with 400', async () => {
    const res = await analytics(req('/api/v1/analytics?from=yesterday'))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/v1/transactions/{id}/confirm and /reject', () => {
  const props = { params: Promise.resolve({ id: 'TXN1' }) }

  it('confirms a pending payment and tells the website', async () => {
    db.transaction.findFirst.mockResolvedValue(txn())
    db.transaction.findUniqueOrThrow.mockResolvedValue(txn({ status: 'success' }))

    const res = await confirm(req('/api/v1/transactions/TXN1/confirm', { method: 'POST' }), props)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.outcome).toBe('success')
    expect(db.transaction.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { txnId: 'TXN1', status: 'pending' },
    }))
    expect(notifyPaymentStatus).toHaveBeenCalledWith('t1', 'success')
  })

  it('a repeat confirm changes nothing and sends no webhook', async () => {
    db.transaction.findFirst.mockResolvedValue(txn({ status: 'success', confirmedAt: new Date() }))

    const res = await confirm(req('/api/v1/transactions/TXN1/confirm', { method: 'POST' }), props)

    expect(res.status).toBe(200)
    expect((await res.json()).outcome).toBe('unchanged')
    expect(db.transaction.updateMany).not.toHaveBeenCalled()
    expect(notifyPaymentStatus).not.toHaveBeenCalled()
  })

  it('rejecting an unconfirmed payment marks it failed', async () => {
    db.transaction.findFirst.mockResolvedValue(txn())
    db.transaction.findUniqueOrThrow.mockResolvedValue(txn({ status: 'failed' }))

    const res = await reject(req('/api/v1/transactions/TXN1/reject', { method: 'POST' }), props)

    expect(res.status).toBe(200)
    expect((await res.json()).outcome).toBe('failed')
    expect(notifyPaymentStatus).toHaveBeenCalledWith('t1', 'failed')
  })

  it('undoing a confirmation after 30 minutes is refused with 409', async () => {
    db.transaction.findFirst.mockResolvedValue(txn({ status: 'success', confirmedAt: new Date(Date.now() - 31 * 60_000) }))

    const res = await reject(req('/api/v1/transactions/TXN1/reject', { method: 'POST' }), props)

    expect(res.status).toBe(409)
    expect(db.transaction.updateMany).not.toHaveBeenCalled()
    expect(notifyPaymentStatus).not.toHaveBeenCalled()
  })

  it('returns 404 for a transaction that is not the merchant own', async () => {
    db.transaction.findFirst.mockResolvedValue(null)

    const res = await confirm(req('/api/v1/transactions/OTHER/confirm', { method: 'POST' }), { params: Promise.resolve({ id: 'OTHER' }) })

    expect(res.status).toBe(404)
    expect(db.transaction.updateMany).not.toHaveBeenCalled()
  })
})
