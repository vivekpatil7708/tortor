'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { formatAmount } from '@/lib/utils'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

const RANGES = [
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: 'This month', value: 'month' },
] as const

type Range = (typeof RANGES)[number]['value']

const STATUS_COLORS: Record<string, string> = {
  success: '#22c55e',
  failed: '#ef4444',
  pending: '#f59e0b',
  initiated: '#f59e0b',
  refunded: '#f97316',
}

function buildParams(range: Range, customFrom?: string, customTo?: string): string {
  const now = new Date()
  let from: Date
  if (customFrom && customTo) {
    return `?from=${customFrom}&to=${customTo}`
  }
  switch (range) {
    case '7d': from = new Date(now.getTime() - 7 * 86400000); break
    case '30d': from = new Date(now.getTime() - 30 * 86400000); break
    case 'month': from = new Date(now.getFullYear(), now.getMonth(), 1); break
    default: return ''
  }
  return `?from=${from.toISOString()}&to=${now.toISOString()}`
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

export default function AnalyticsPage() {
  const [range, setRange] = useState<Range>('7d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null)
  const [ordersTS, setOrdersTS] = useState<Array<{ date: string; total: number; success: number; failed: number; pending: number }>>([])
  const [paymentsTS, setPaymentsTS] = useState<Array<{ date: string; amount: number }>>([])
  const [statusBreakdown, setStatusBreakdown] = useState<Record<string, number>>({})
  const [topEntities, setTopEntities] = useState<{ top_payment_apps: Array<{ name: string; count: number; amount: number }>; top_links: Array<{ name: string; count: number; amount: number }> } | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    const params = buildParams(range, customFrom || undefined, customTo || undefined)
    try {
      const [s, ots, pts, sb, te] = await Promise.all([
        api.getAnalyticsSummary(params),
        api.getOrdersTimeseries(params),
        api.getPaymentsTimeseries(params),
        api.getStatusBreakdown(params),
        api.getTopEntities(params),
      ])
      setSummary(s)
      setOrdersTS(ots.timeseries || [])
      setPaymentsTS(pts.timeseries || [])
      setStatusBreakdown(sb.breakdown || {})
      setTopEntities(te as typeof topEntities)
    } catch {
      setError('Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [range, customFrom, customTo])

  useEffect(() => { fetchData() }, [fetchData])

  const handleExport = () => {
    const rows: Record<string, unknown>[] = paymentsTS.map(p => ({ date: p.date, revenue: p.amount }))
    exportCSV(rows, `analytics-${range}.csv`)
  }

  const pieData = Object.entries(statusBreakdown).map(([name, value]) => ({ name, value }))

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
          <p className="text-sm text-gray-500">Track your payment performance.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard label="Total Orders" value={String(summary?.total_orders || 0)} color="text-charcoal" />
            <KPICard label="Successful" value={String(summary?.successful_payments || 0)} color="text-green-600" subtitle={summary?.conversion_rate ? `${summary.conversion_rate}% conversion` : undefined} />
            <KPICard label="Failed" value={String(summary?.failed_payments || 0)} color="text-red-600" />
            <KPICard label="Pending" value={String(summary?.pending_orders || 0)} color="text-amber-600" />
            <KPICard label="Gross Volume" value={formatAmount(Number(summary?.gross_payment_volume || 0))} color="text-purple-600" />
            <KPICard label="Refunds" value={formatAmount(Number(summary?.refund_amount || 0))} color="text-orange-600" />
            <KPICard label="Avg Order Value" value={formatAmount(Number(summary?.average_order_value || 0))} color="text-blue-600" />
            <KPICard label="Conv. Rate" value={summary?.conversion_rate ? `${summary.conversion_rate}%` : '0%'} color="text-emerald-600" />
          </div>

          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
              <h2 className="mb-4 text-sm font-bold text-gray-700">Orders Over Time</h2>
              {ordersTS.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No order data for this period.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={ordersTS}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="total" stroke="#2c2c2c" strokeWidth={2} dot={false} name="Total" />
                    <Line type="monotone" dataKey="success" stroke="#22c55e" strokeWidth={2} dot={false} name="Success" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
              <h2 className="mb-4 text-sm font-bold text-gray-700">Payment Volume Over Time</h2>
              {paymentsTS.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No payment data for this period.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={paymentsTS}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₹' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)} />
                    <Tooltip />
                    <Bar dataKey="amount" fill="#7bb86c" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="mb-6 grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
              <h2 className="mb-4 text-sm font-bold text-gray-700">Payment Status</h2>
              {pieData.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                      {pieData.map(entry => <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || '#9ca3af'} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm lg:col-span-2">
              <h2 className="mb-4 text-sm font-bold text-gray-700">Top Payment Apps</h2>
              {!topEntities?.top_payment_apps?.length ? (
                <p className="py-8 text-center text-sm text-gray-400">No payment app data.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={topEntities.top_payment_apps} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#2c2c2c" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {topEntities?.top_links?.length ? (
            <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
              <h2 className="mb-4 text-sm font-bold text-gray-700">Top Payment Links</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-100">
                    <tr>
                      <th className="pb-2 font-semibold text-gray-500">Link</th>
                      <th className="pb-2 font-semibold text-gray-500">Transactions</th>
                      <th className="pb-2 font-semibold text-gray-500">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topEntities.top_links.map(l => (
                      <tr key={l.name} className="border-b border-gray-50">
                        <td className="py-2 text-gray-700">{l.name}</td>
                        <td className="py-2">{l.count}</td>
                        <td className="py-2 font-medium">{formatAmount(l.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
