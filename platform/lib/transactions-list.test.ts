import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const db = vi.hoisted(() => ({
  transaction: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
const auth = vi.hoisted(() => ({ requireSession: vi.fn() }))
vi.mock('@/lib/auth', () => auth)

import { GET as list } from '@/app/api/transactions/list/route'
import { GET as summary } from '@/app/api/analytics/summary/route'

// 600 transactions, newest first, as the database returns them.
const rows = Array.from({ length: 600 }, (_, i) => ({
  id: `t-${String(i).padStart(3, '0')}`, merchantId: 'm1', paymentLinkId: 'L1', txnId: `TXN${i}`, upiTxnId: null,
  amount: 100, customerName: null, customerPhone: null, customerEmail: null, customerNote: null, customFieldValues: '{}',
  status: 'success', settlementStatus: 'pending', settlementAmount: null, settlementDate: null, paymentApp: null,
  payerVpa: null, upiPaymentRef: null, errorMessage: null, confirmedAt: null,
  createdAt: new Date(Date.UTC(2026, 9, 6) - i * 60_000), updatedAt: new Date(Date.UTC(2026, 9, 6)),
}))

type FindArgs = { take: number; cursor?: { id: string }; skip?: number }
type Page = { transactions: Array<{ id: string }>; next_cursor: string | null; total: number | null }

const get = (query: string) => list(new NextRequest(`http://localhost/api/transactions/list?${query}`))
const page = async (query: string) => (await (await get(query)).json()) as Page

beforeEach(() => {
  vi.clearAllMocks()
  auth.requireSession.mockResolvedValue({ id: 'm1' })
  db.transaction.findMany.mockImplementation(async ({ take, cursor, skip }: FindArgs) => {
    const start = cursor ? rows.findIndex(r => r.id === cursor.id) + (skip ?? 0) : 0
    return rows.slice(start, start + take)
  })
  db.transaction.count.mockResolvedValue(600)
})

describe('transactions list (B5)', () => {
  it('returns 50 at a time with the total, and the next page continues where it stopped', async () => {
    const first = await page('limit=50')
    expect(first.transactions).toHaveLength(50)
    expect(first.transactions[0].id).toBe('t-000')
    expect(first.next_cursor).toBe('t-049')
    expect(first.total).toBe(600)

    const second = await page('limit=50&cursor=t-049')
    expect(second.transactions[0].id).toBe('t-050')
    expect(second.total).toBeNull()

    expect(db.transaction.findMany).toHaveBeenNthCalledWith(1, {
      where: { merchantId: 'm1' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
    })
    expect(db.transaction.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: { id: 't-049' }, skip: 1 }))
  })

  it('reaches every transaction: nothing is cut off at 500', async () => {
    const seen: string[] = []
    let cursor = ''
    do {
      const next = await page(`limit=500${cursor ? `&cursor=${cursor}` : ''}`)
      seen.push(...next.transactions.map(t => t.id))
      cursor = next.next_cursor ?? ''
    } while (cursor)

    expect(seen).toHaveLength(600)
    expect(new Set(seen).size).toBe(600)
    expect(seen.at(-1)).toBe('t-599')
  })

  it('filters by status, link and Indian dates on the server', async () => {
    await get('limit=50&status=pending&link=L1&from=2026-10-01&to=2026-10-06')

    const where = {
      merchantId: 'm1',
      status: 'pending',
      paymentLinkId: 'L1',
      createdAt: { gte: new Date('2026-09-30T18:30:00Z'), lt: new Date('2026-10-06T18:30:00Z') },
    }
    expect(db.transaction.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }))
    expect(db.transaction.count).toHaveBeenCalledWith({ where })
  })

  it('rejects filters it does not understand', async () => {
    for (const query of [
      'limit=0', 'limit=501', 'limit=abc', 'limit=50&status=paid', 'limit=50&from=06-10-2026',
      'limit=50&to=2026-02-30', 'limit=50&cursor=../x', 'limit=50&link=a%20b',
    ]) {
      expect((await get(query)).status, query).toBe(400)
    }
    expect(db.transaction.findMany).not.toHaveBeenCalled()
  })

  it('still answers dashboard tabs opened before the update with the old list', async () => {
    const res = await get('')
    const body = await res.json()

    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(500)
  })

  it('refuses a request without a login', async () => {
    auth.requireSession.mockRejectedValue(new Error('Unauthorized'))
    expect((await get('limit=50')).status).toBe(401)
  })

  it('reports a database failure as an error, not as "signed out"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.transaction.findMany.mockRejectedValue(Object.assign(new Error('connection lost'), { code: 'P1001' }))

    const res = await get('limit=50')

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Something went wrong. Please try again.' })
  })
})

describe('transactions search (U19)', () => {
  it('searches name, phone and reference, within your own payments only', async () => {
    await get('limit=50&q=%20Arjun%20')

    const where = db.transaction.findMany.mock.calls[0][0].where
    expect(where).toEqual({
      merchantId: 'm1',
      OR: [
        { customerName: { contains: 'Arjun', mode: 'insensitive' } },
        { customerPhone: { contains: 'Arjun' } },
        { txnId: { contains: 'Arjun', mode: 'insensitive' } },
        { upiTxnId: { contains: 'Arjun', mode: 'insensitive' } },
        { upiPaymentRef: { contains: 'Arjun', mode: 'insensitive' } },
      ],
    })
    expect(db.transaction.count).toHaveBeenCalledWith({ where })
  })

  it('works together with the status and date filters', async () => {
    await get('limit=50&status=pending&from=2026-10-01&q=TXN17')
    expect(db.transaction.findMany.mock.calls[0][0].where).toMatchObject({
      merchantId: 'm1', status: 'pending', createdAt: { gte: new Date('2026-09-30T18:30:00Z') },
      OR: expect.arrayContaining([{ txnId: { contains: 'TXN17', mode: 'insensitive' } }]),
    })
  })

  it('finds a phone number typed with spaces', async () => {
    await get('limit=50&q=98765%2043210')
    expect(db.transaction.findMany.mock.calls[0][0].where.OR).toContainEqual({ customerPhone: { contains: '9876543210' } })
  })

  it('refuses a search over 64 characters, and ignores a blank one', async () => {
    expect((await get(`limit=50&q=${'a'.repeat(65)}`)).status).toBe(400)
    expect(db.transaction.findMany).not.toHaveBeenCalled()

    await get('limit=50&q=%20%20')
    expect(db.transaction.findMany.mock.calls[0][0].where).toEqual({ merchantId: 'm1' })
  })
})

describe('dashboard totals (B5)', () => {
  const totals = () => summary(new NextRequest('http://localhost/api/analytics/summary'))

  it('adds up every transaction in the database instead of loading them', async () => {
    db.transaction.groupBy.mockResolvedValue([
      { status: 'success', _count: { _all: 450 }, _sum: { amount: 45000 } },
      { status: 'failed', _count: { _all: 50 }, _sum: { amount: 5000 } },
      { status: 'pending', _count: { _all: 60 }, _sum: { amount: 6000 } },
      { status: 'initiated', _count: { _all: 40 }, _sum: { amount: 4000 } },
    ])

    db.transaction.count.mockResolvedValue(25) // initiated more than 30 minutes ago

    const body = await (await totals()).json()

    expect(body).toEqual({
      total_orders: 600,
      successful_payments: 450,
      failed_payments: 50,
      pending_orders: 100,
      gross_payment_volume: 45000,
      refund_amount: 0,
      conversion_rate: 75,
      average_order_value: 100,
      success_rate: 90,
      waiting_payments: 60,
      abandoned_checkouts: 25,
      in_progress_checkouts: 15,
    })
    expect(db.transaction.groupBy).toHaveBeenCalledWith(expect.objectContaining({ by: ['status'], where: { merchantId: 'm1' } }))
    expect(db.transaction.findMany).not.toHaveBeenCalled()
  })

  it('shows zeros for a merchant with no transactions, and no success rate yet', async () => {
    db.transaction.groupBy.mockResolvedValue([])
    db.transaction.count.mockResolvedValue(0)
    expect(await (await totals()).json()).toMatchObject({
      total_orders: 0, gross_payment_volume: 0, conversion_rate: 0, success_rate: null, abandoned_checkouts: 0,
    })
  })

  it("doesn't count abandoned checkouts as failures (B13)", async () => {
    // 9 paid, 1 rejected, 30 checkouts opened and left: 90%, not 9 out of 40.
    db.transaction.groupBy.mockResolvedValue([
      { status: 'success', _count: { _all: 9 }, _sum: { amount: 900 } },
      { status: 'failed', _count: { _all: 1 }, _sum: { amount: 100 } },
      { status: 'initiated', _count: { _all: 30 }, _sum: { amount: 3000 } },
    ])
    db.transaction.count.mockResolvedValue(30)

    const body = await (await totals()).json()

    expect(body.success_rate).toBe(90)
    expect(body.conversion_rate).toBe(22.5)
    expect(body.abandoned_checkouts).toBe(30)
    const { where } = db.transaction.count.mock.calls[0][0]
    expect(where.AND[0]).toEqual({ merchantId: 'm1' })
    expect(where.AND[1].status).toBe('initiated')
    expect(Date.now() - where.AND[1].createdAt.lt.getTime()).toBeGreaterThanOrEqual(30 * 60_000 - 1000)
  })

  it('keeps the date range the analytics page already sends', async () => {
    db.transaction.groupBy.mockResolvedValue([])
    await summary(new NextRequest('http://localhost/api/analytics/summary?from=2026-09-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z'))

    expect(db.transaction.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { merchantId: 'm1', createdAt: { gte: new Date('2026-09-01T00:00:00.000Z'), lte: new Date('2026-10-01T00:00:00.000Z') } },
    }))
  })
})
