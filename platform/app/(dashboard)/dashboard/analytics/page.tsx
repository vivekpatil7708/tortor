'use client'

import { useEffect, useState, useCallback } from 'react'
import { formatAmount } from '@/lib/utils'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'

const RANGES = [
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: 'This month', value: 'month' },
  { label: 'All', value: 'all' },
] as const

type Range = (typeof RANGES)[number]['value']
type GroupBy = 'day' | 'week' | 'month'

const STATUS_COLORS: Record<string, string> = {
  paid: '#22c55e',
  pending: '#f59e0b',
  refunded: '#f97316',
  cancelled: '#ef4444',
}

function buildParams(range: Range, groupBy: GroupBy, status: string, customFrom?: string, customTo?: string): string {
  const sp = new URLSearchParams({ groupBy, status })
  const now = new Date()
  if (customFrom && customTo) {
    sp.set('from', customFrom)
    sp.set('to', customTo)
    return `?${sp.toString()}`
  }
  if (range === 'all') return `?${sp.toString()}`
  const map: Record<string, Date> = {
    '7d': new Date(now.getTime() - 7 * 86400000),
    '30d': new Date(now.getTime() - 30 * 86400000),
    month: new Date(now.getFullYear(), now.getMonth(), 1),
  }
  sp.set('from', (map[range] ?? now).toISOString())
  sp.set('to', now.toISOString())
  return `?${sp.toString()}`
}

function exportCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return
  const keys = Object.keys(data[0])
  const csv = [keys.join(','), ...data.map(r => keys.map(k => String(r[k] ?? '')).join(','))].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-100 ${className || ''}`} />
}

function KPICard({ label, value, subtitle, color }: { label: string; value: string; subtitle?: string; color: string }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
      {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
    </div>
  )
}

interface AdvancedResult {
  summary: { orders: number; revenue: number; paidOrders: number; avgOrderValue: number; pendingRevenue: number; refundedOrders: number; cancelledOrders: number; unitsSold: number }
  timeseries: Array<{ key: string; label: string; orders: number; revenue: number }>
  byStatus: Array<{ order_status: string; payment_status: string; _count: number }>
  topSKUs: Array<{ sku: string; name: string; units: number; revenue: number }>
  topChannels: Array<{ source: string; orders: number; revenue: number }>
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<Range>('7d')
  const [groupBy, setGroupBy] = useState<GroupBy>('day')
  const [status, setStatus] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<AdvancedResult | null>(null)
  const [movement, setMovement] = useState<{ revenueMoM: number; ordersWoW: number } | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    const params = buildParams(range, groupBy, status, customFrom || undefined, customTo || undefined)
    try {
      const [r, m] = await Promise.all([
        fetch(`/api/analytics/advanced${params}`).then(res => {
          if (!res.ok) throw new Error('Failed to load analytics')
          return res.json()
        }),
        fetch('/api/analytics/movement').then(res => (res.ok ? res.json() : null)),
      ])
      setData(r as AdvancedResult)
      setMovement(m as typeof movement)
    } catch {
      setError('Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [range, groupBy, status, customFrom, customTo])

  useEffect(() => { fetchData() }, [fetchData])

  const handleExport = () => {
    const rows: Record<string, unknown>[] = (data?.timeseries ?? []).map(p => ({ date: p.key, orders: p.orders, revenue: p.revenue }))
    exportCSV(rows, `analytics-${range}.csv`)
  }

  const pieData = (data?.byStatus ?? []).map(s => ({
    name: `${s.payment_status}${s.order_status === 'cancelled' ? ' (cancelled)' : ''}`,
    value: s._count,
  }))

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm text-red-500">{error}</p>
        <button onClick={fetchData} className="mt-4 rounded-xl bg-charcoal px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">Retry</button>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-gray-500">Order-based revenue &amp; fulfilment performance.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600">
            <option value="all">All orders</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="refunded">Refunded</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600">
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
          <div className="flex rounded-xl border border-gray-200 bg-white p-0.5">
            {RANGES.map(r => (
              <button key={r.value} onClick={() => { setRange(r.value); setCustomFrom(''); setCustomTo('') }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${range === r.value ? 'bg-charcoal text-white' : 'text-gray-500 hover:text-charcoal'}`}>{r.label}</button>
            ))}
          </div>
          <input type="date" value={customFrom} onChange={e => { setCustomFrom(e.target.value); setRange('' as Range) }}
            className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs" />
          <input type="date" value={customTo} onChange={e => { setCustomTo(e.target.value); setRange('' as Range) }}
            className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs" />
          <button onClick={handleExport} className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-charcoal">Export CSV</button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-64" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      ) : data ? (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard label="Orders" value={String(data.summary.orders)} color="text-charcoal" />
            <KPICard label="Paid Orders" value={String(data.summary.paidOrders)} color="text-green-600" subtitle={movement ? `${movement.ordersWoW >= 0 ? '+' : ''}${movement.ordersWoW}% WoW` : undefined} />
            <KPICard label="Revenue" value={formatAmount(data.summary.revenue)} color="text-purple-600" subtitle={movement ? `${movement.revenueMoM >= 0 ? '+' : ''}${movement.revenueMoM}% vs last month` : undefined} />
            <KPICard label="Avg Order Value" value={formatAmount(data.summary.avgOrderValue)} color="text-blue-600" />
            <KPICard label="Units Sold" value={String(data.summary.unitsSold)} color="text-charcoal" />
            <KPICard label="Pending Revenue" value={formatAmount(data.summary.pendingRevenue)} color="text-amber-600" />
            <KPICard label="Refunded Orders" value={String(data.summary.refundedOrders)} color="text-orange-600" />
            <KPICard label="Cancelled" value={String(data.summary.cancelledOrders)} color="text-red-600" />
          </div>

          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
              <h2 className="mb-4 text-sm font-bold text-gray-700">Orders Over Time</h2>
              {data.timeseries.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No order data for this period.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={data.timeseries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="orders" stroke="#2c2c2c" strokeWidth={2} dot={false} name="Orders" />
                    <Line type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={2} dot={false} name="Revenue" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
              <h2 className="mb-4 text-sm font-bold text-gray-700">Revenue Over Time</h2>
              {data.timeseries.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No revenue data for this period.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.timeseries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₹' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)} />
                    <Tooltip />
                    <Bar dataKey="revenue" fill="#7bb86c" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="mb-6 grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
              <h2 className="mb-4 text-sm font-bold text-gray-700">Order Status</h2>
              {pieData.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                      {pieData.map(entry => <Cell key={entry.name} fill={STATUS_COLORS[entry.name.split(' ')[0]] || '#9ca3af'} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm lg:col-span-2">
              <h2 className="mb-4 text-sm font-bold text-gray-700">Top Products</h2>
              {data.topSKUs.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No product sales yet.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-100">
                    <tr>
                      <th className="pb-2 font-semibold text-gray-500">Product</th>
                      <th className="pb-2 font-semibold text-gray-500">SKU</th>
                      <th className="pb-2 font-semibold text-gray-500">Units</th>
                      <th className="pb-2 font-semibold text-gray-500">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topSKUs.map(s => (
                      <tr key={s.sku} className="border-b border-gray-50">
                        <td className="py-2 text-gray-700">{s.name}</td>
                        <td className="py-2 text-gray-400">{s.sku}</td>
                        <td className="py-2">{s.units}</td>
                        <td className="py-2 font-medium">{formatAmount(s.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {data.topChannels.length > 0 ? (
            <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
              <h2 className="mb-4 text-sm font-bold text-gray-700">Sales by Channel</h2>
              <div className="flex flex-wrap gap-6">
                {data.topChannels.map(c => (
                  <div key={c.source} className="min-w-36">
                    <p className="text-xs font-medium text-gray-500">{c.source || 'unknown'}</p>
                    <p className="text-xl font-bold text-charcoal">{formatAmount(c.revenue)}</p>
                    <p className="text-xs text-gray-400">{c.orders} orders</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="py-16 text-center text-sm text-gray-400">No data loaded.</p>
      )}
    </div>
  )
}