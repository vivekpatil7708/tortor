import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/tenant', () => ({
  requireMerchant: vi.fn(async () => ({ id: 'm1', accountId: 'a1' })),
}))

const createManualRefund = vi.hoisted(() => vi.fn())
const listManualRefunds = vi.hoisted(() => vi.fn())
const markRefundProcessed = vi.hoisted(() => vi.fn())
vi.mock('@/lib/refund-tracking', () => ({
  createManualRefund,
  listManualRefunds,
  markRefundProcessed,
}))

import { GET, POST } from '@/app/api/refunds/route'
import { PATCH } from '@/app/api/refunds/[id]/route'

const post = (body: Record<string, unknown>) =>
  POST(new NextRequest('http://localhost/api/refunds', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => {
  vi.clearAllMocks()
  listManualRefunds.mockResolvedValue({ refunds: [], total_pending: 0, total_processed: 0 })
  createManualRefund.mockResolvedValue({ id: 'r1', status: 'pending' })
  markRefundProcessed.mockResolvedValue({ refund: { id: 'r1', status: 'processed' }, notifications: [] })
})

describe('POST /api/refunds', () => {
  it('records a refund against a transaction', async () => {
    const res = await post({ transaction_id: 'TXN1', amount: 200, reason: 'Returned' })

    expect(res.status).toBe(201)
    expect(createManualRefund).toHaveBeenCalledWith({
      merchantId: 'm1',
      orderId: null,
      transactionId: 'TXN1',
      amount: 200,
      reason: 'Returned',
      actorUserId: 'a1',
    })
  })

  it('refuses a refund with no order or payment', async () => {
    const res = await post({ amount: 200 })
    expect(res.status).toBe(400)
    expect(createManualRefund).not.toHaveBeenCalled()
  })

  it('refuses zero or negative amounts', async () => {
    for (const amount of [0, -10, 'abc']) {
      expect((await post({ transaction_id: 'TXN1', amount })).status).toBe(400)
    }
    expect(createManualRefund).not.toHaveBeenCalled()
  })
})

describe('GET /api/refunds', () => {
  it('passes the status filter to the list', async () => {
    const res = await GET(new NextRequest('http://localhost/api/refunds?status=processed'))
    expect(res.status).toBe(200)
    expect(listManualRefunds).toHaveBeenCalledWith('m1', { status: 'processed' })
  })
})

describe('PATCH /api/refunds/[id]', () => {
  const patch = (body: Record<string, unknown>) =>
    PATCH(
      new NextRequest('http://localhost/api/refunds/r1', { method: 'PATCH', body: JSON.stringify(body) }),
      { params: Promise.resolve({ id: 'r1' }) },
    )

  it('marks a refund processed', async () => {
    const res = await patch({ status: 'processed' })
    expect(res.status).toBe(200)
    expect(markRefundProcessed).toHaveBeenCalledWith({
      merchantId: 'm1',
      refundId: 'r1',
      actorUserId: 'a1',
    })
  })

  it('only accepts the processed state', async () => {
    const res = await patch({ status: 'failed' })
    expect(res.status).toBe(400)
    expect(markRefundProcessed).not.toHaveBeenCalled()
  })
})
