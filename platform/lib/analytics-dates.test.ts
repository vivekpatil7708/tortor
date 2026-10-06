import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createdAtRange, istDayKey } from './ist-day'

const db = vi.hoisted(() => ({
  transaction: { findMany: vi.fn(), groupBy: vi.fn() },
  paymentLink: { findMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ id: 'm1' })) }))

import { GET as ordersTimeseries } from '@/app/api/analytics/orders-timeseries/route'
import { GET as paymentsTimeseries } from '@/app/api/analytics/payments-timeseries/route'
import { GET as statusBreakdown } from '@/app/api/analytics/status-breakdown/route'
import { GET as topEntities } from '@/app/api/analytics/top-entities/route'
import { GET as summary } from '@/app/api/analytics/summary/route'

const twoAmIst = new Date('2026-10-05T20:30:00Z') // 02:00 on 6 Oct in India
const eveningIst = new Date('2026-10-05T10:00:00Z') // 15:30 on 5 Oct in India

describe('Indian days for charts (B7)', () => {
  it('puts a 2 AM payment on the day it happened in India, not the UTC day before', () => {
    expect(istDayKey(twoAmIst)).toBe('2026-10-06')
    expect(istDayKey(new Date('2026-10-05T18:29:59Z'))).toBe('2026-10-05')
    expect(istDayKey(new Date('2026-10-05T18:30:00Z'))).toBe('2026-10-06')
  })
})

describe('date ranges (B7)', () => {
  it('reads a custom range of plain dates as whole days in India', () => {
    expect(createdAtRange('2026-10-01', '2026-10-06')).toEqual({
      gte: new Date('2026-09-30T18:30:00Z'),
      lt: new Date('2026-10-06T18:30:00Z'),
    })
  })

  it('keeps the preset ranges, which send exact timestamps, as they are', () => {
    expect(createdAtRange('2026-09-29T08:00:00.000Z', '2026-10-06T08:00:00.000Z')).toEqual({
      gte: new Date('2026-09-29T08:00:00.000Z'),
      lte: new Date('2026-10-06T08:00:00.000Z'),
    })
  })

  it('allows an open-ended range and rejects anything else', () => {
    expect(createdAtRange(null, null)).toEqual({})
    expect(createdAtRange('2026-10-01', null)).toEqual({ gte: new Date('2026-09-30T18:30:00Z') })
    for (const bad of ['yesterday', '2026-02-30', '06-10-2026', '2026-10-06T08:00', '1759740000000']) {
      expect(createdAtRange(bad, null)).toBeNull()
      expect(createdAtRange(null, bad)).toBeNull()
    }
  })
})

describe('analytics routes (B7)', () => {
  const get = (route: (req: NextRequest) => Promise<Response>, query = '') =>
    route(new NextRequest(`http://localhost/api/analytics/x${query}`))

  beforeEach(() => {
    vi.clearAllMocks()
    db.transaction.groupBy.mockResolvedValue([])
    db.paymentLink.findMany.mockResolvedValue([])
  })

  it('charts orders by Indian day', async () => {
    db.transaction.findMany.mockResolvedValue([
      { createdAt: eveningIst, status: 'failed' },
      { createdAt: twoAmIst, status: 'success' },
    ])

    const { timeseries } = await (await get(ordersTimeseries)).json()

    expect(timeseries).toEqual([
      { date: '2026-10-05', total: 1, success: 0, failed: 1, pending: 0 },
      { date: '2026-10-06', total: 1, success: 1, failed: 0, pending: 0 },
    ])
  })

  it('charts revenue by Indian day', async () => {
    db.transaction.findMany.mockResolvedValue([{ createdAt: twoAmIst, amount: 499 }])
    const { timeseries } = await (await get(paymentsTimeseries)).json()
    expect(timeseries).toEqual([{ date: '2026-10-06', amount: 499 }])
  })

  it('includes the whole last day of a custom range on every analytics view', async () => {
    db.transaction.findMany.mockResolvedValue([])
    const range = { gte: new Date('2026-09-30T18:30:00Z'), lt: new Date('2026-10-06T18:30:00Z') }

    for (const route of [ordersTimeseries, paymentsTimeseries, statusBreakdown, topEntities]) {
      db.transaction.findMany.mockClear()
      await get(route, '?from=2026-10-01&to=2026-10-06')
      expect(db.transaction.findMany.mock.calls[0][0].where.createdAt).toEqual(range)
    }
    await get(summary, '?from=2026-10-01&to=2026-10-06')
    expect(db.transaction.groupBy.mock.calls[0][0].where.createdAt).toEqual(range)
  })

  it('rejects dates it cannot read', async () => {
    for (const route of [ordersTimeseries, paymentsTimeseries, statusBreakdown, topEntities, summary]) {
      expect((await get(route, '?from=yesterday')).status).toBe(400)
    }
  })

  it('reports a database failure as an error, not as "signed out"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.transaction.findMany.mockRejectedValue(Object.assign(new Error('connection lost'), { code: 'P1001' }))
    expect((await get(ordersTimeseries)).status).toBe(500)
  })
})
