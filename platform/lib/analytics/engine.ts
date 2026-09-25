import { prisma } from '@/lib/prisma'
import type { PaymentStatus, Prisma } from '@prisma/client'

export type AnalyticsStatusGroup = 'all' | 'paid' | 'pending' | 'refunded' | 'cancelled'
export type AnalyticsGroupBy = 'day' | 'week' | 'month'

export interface AnalyticsFilters {
  merchantId: string
  from?: Date
  to?: Date
  status?: AnalyticsStatusGroup
  channel?: string
  groupBy?: AnalyticsGroupBy
}

export interface AnalyticsSummary {
  orders: number
  revenue: number
  paidOrders: number
  avgOrderValue: number
  pendingRevenue: number
  refundedOrders: number
  cancelledOrders: number
  unitsSold: number
}

export interface TimeseriesPoint {
  key: string
  label: string
  orders: number
  revenue: number
}

export interface StatusSlice {
  order_status: string
  payment_status: string
  _count: number
}

export interface TopSku {
  sku: string
  name: string
  units: number
  revenue: number
}

export interface TopChannel {
  source: string
  orders: number
  revenue: number
}

export interface AnalyticsResult {
  summary: AnalyticsSummary
  timeseries: TimeseriesPoint[]
  byStatus: StatusSlice[]
  topSKUs: TopSku[]
  topChannels: TopChannel[]
}

/** Payment statuses that represent successful money received. */
const PAID: PaymentStatus[] = ['paid', 'partially_refunded', 'refunded']
const PENDING: PaymentStatus[] = ['pending', 'processing']
const REFUNDED: PaymentStatus[] = ['partially_refunded', 'refunded']
const OTHER: PaymentStatus[] = ['failed', 'expired', 'disputed']

function isoWeekStart(d: Date): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = date.getUTCDay() === 0 ? 7 : date.getUTCDay()
  date.setUTCDate(date.getUTCDate() - (day - 1))
  return date
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function dateGroupKey(d: Date, groupBy: AnalyticsGroupBy): string {
  switch (groupBy) {
    case 'day':
      return toISO(d)
    case 'week':
      return toISO(isoWeekStart(d))
    case 'month':
      return d.toISOString().slice(0, 7)
  }
}

export function dateGroupLabel(key: string, groupBy: AnalyticsGroupBy): string {
  if (groupBy === 'day') {
    const [y, m, day] = key.split('-')
    return `${day}/${m}/${y.slice(2)}`
  }
  if (groupBy === 'week') return `Wk of ${key.slice(5, 10)}`
  const [y, m] = key.split('-')
  return `${m}/${y}`
}

type OrderRow = {
  orderStatus: string
  paymentStatus: PaymentStatus
  totalAmount: { toNumber(): number }
  createdAt: Date
  source: string
  orderItems: Array<{
    productNameSnapshot: string
    skuSnapshot: string | null
    quantityOrdered: number
    lineTotal: { toNumber(): number }
  }>
}

function inStatus(row: OrderRow, group: 'paid' | 'pending' | 'refunded'): boolean {
  if (group === 'paid') return PAID.includes(row.paymentStatus)
  if (group === 'pending') return PENDING.includes(row.paymentStatus)
  return REFUNDED.includes(row.paymentStatus)
}

/** Order-based analytics, always scoped to a single merchant. */
export async function runOrderAnalytics(filters: AnalyticsFilters): Promise<AnalyticsResult> {
  const { merchantId } = filters
  const groupBy: AnalyticsGroupBy = filters.groupBy ?? 'day'
  const statusGroup: AnalyticsStatusGroup = filters.status ?? 'all'

  const base: Prisma.OrderWhereInput = { merchantId }
  if (filters.from || filters.to) {
    base.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    }
  }
  if (filters.channel) base.source = filters.channel as never

  // The whole merchant window is scanned once and grouped in JS, so filters apply uniformly.
  const orders = (await prisma.order.findMany({
    where: base,
    select: {
      orderStatus: true,
      paymentStatus: true,
      totalAmount: true,
      createdAt: true,
      source: true,
      orderItems: {
        select: { productNameSnapshot: true, skuSnapshot: true, quantityOrdered: true, lineTotal: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  })) as unknown as OrderRow[]

  const buckets: Record<string, TimeseriesPoint> = {}
  const byStatus: Record<string, StatusSlice> = {}
  const skuMap: Record<string, TopSku> = {}
  const channelMap: Record<string, TopChannel> = {}

  const eligible = (o: OrderRow) => {
    if (statusGroup === 'all') return true
    if (statusGroup === 'cancelled') return o.orderStatus === 'cancelled'
    return inStatus(o, statusGroup)
  }

  let revenue = 0
  let unitsSold = 0
  let paidOrders = 0
  let pendingRevenue = 0
  let cancelledOrders = 0
  let refundedOrders = 0

  for (const o of orders) {
    const key = dateGroupKey(o.createdAt, groupBy)
    let point = buckets[key]
    if (!point) {
      point = { key, label: dateGroupLabel(key, groupBy), orders: 0, revenue: 0 }
      buckets[key] = point
    }
    point.orders += 1

    if (o.orderStatus === 'cancelled') cancelledOrders += 1
    if (REFUNDED.includes(o.paymentStatus)) refundedOrders += 1

    if (eligible(o)) {
      const amt = o.totalAmount.toNumber()
      point.revenue += amt
      revenue += amt
      paidOrders += 1
      unitsSold += o.orderItems.reduce((a, i) => a + i.quantityOrdered, 0)
    } else if (PENDING.includes(o.paymentStatus) && statusGroup !== 'pending') {
      pendingRevenue += o.totalAmount.toNumber()
    }

    for (const item of o.orderItems) {
      const sku = item.skuSnapshot || item.productNameSnapshot
      const cur = skuMap[sku]
      const revenueUnit = item.lineTotal.toNumber()
      if (cur) {
        cur.units += item.quantityOrdered
        cur.revenue += revenueUnit
      } else {
        skuMap[sku] = { sku, name: item.productNameSnapshot, units: item.quantityOrdered, revenue: revenueUnit }
      }
    }

    if (eligible(o)) {
      const sk = `${o.orderStatus}|${o.paymentStatus}`
      const existing = byStatus[sk]
      if (existing) existing._count += 1
      else byStatus[sk] = { order_status: o.orderStatus, payment_status: o.paymentStatus, _count: 1 }
    }

    const cur = channelMap[o.source]
    if (cur) {
      cur.orders += 1
      if (eligible(o)) cur.revenue += o.totalAmount.toNumber()
    } else {
      channelMap[o.source] = { source: o.source, orders: 1, revenue: eligible(o) ? o.totalAmount.toNumber() : 0 }
    }
  }

  return {
    summary: {
      orders: orders.length,
      revenue: Math.round(revenue * 100) / 100,
      paidOrders,
      avgOrderValue: paidOrders > 0 ? Math.round((revenue / paidOrders) * 100) / 100 : 0,
      pendingRevenue: Math.round(pendingRevenue * 100) / 100,
      refundedOrders,
      cancelledOrders,
      unitsSold,
    },
    timeseries: Object.values(buckets).sort((a, b) => a.key.localeCompare(b.key)),
    byStatus: Object.values(byStatus).sort((a, b) => b._count - a._count),
    topSKUs: Object.values(skuMap).sort((a, b) => b.units - a.units || b.revenue - a.revenue).slice(0, 10),
    topChannels: Object.values(channelMap).sort((a, b) => b.revenue - a.revenue),
  }
}

/** Month-over-month, week-over-week movement for the dashboard sparklines. */
export async function runMovement(filters: { merchantId: string }): Promise<{
  revenueMoM: number
  ordersWoW: number
}> {
  const { merchantId } = filters
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const weekAgo = new Date(now.getTime() - 7 * 86400000)
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000)

  const [curMonth, prevMonth, thisWeek, lastWeek] = await Promise.all([
    prisma.order.aggregate({
      where: { merchantId, createdAt: { gte: monthStart }, paymentStatus: { in: PAID } },
      _sum: { totalAmount: true },
    }),
    prisma.order.aggregate({
      where: { merchantId, createdAt: { gte: prevMonthStart, lt: monthStart }, paymentStatus: { in: PAID } },
      _sum: { totalAmount: true },
    }),
    prisma.order.count({ where: { merchantId, createdAt: { gte: weekAgo } } }),
    prisma.order.count({ where: { merchantId, createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
  ])

  const prev = prevMonth._sum?.totalAmount?.toNumber() ?? 0
  const cur = curMonth._sum?.totalAmount?.toNumber() ?? 0
  const revenueMoM = prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0
  const ordersWoW = lastWeek > 0 ? ((thisWeek - lastWeek) / lastWeek) * 100 : thisWeek > 0 ? 100 : 0

  return { revenueMoM: Math.round(revenueMoM * 10) / 10, ordersWoW: Math.round(ordersWoW * 10) / 10 }
}