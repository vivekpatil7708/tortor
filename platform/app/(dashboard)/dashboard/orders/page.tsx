'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, Select } from '@/components/ui/form'
import { formatMoney, formatShortDate, humanize, ORDER_STATUSES, PAYMENT_STATUSES, FULFILLMENT_SUMMARY_STATUSES, ORDER_SOURCES } from '@/lib/ui-format'
import { Search, Plus, Download, ChevronLeft, ChevronRight } from 'lucide-react'

export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [orderStatus, setOrderStatus] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('')
  const [source, setSource] = useState('')

  const pageSize = 20

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (orderStatus) params.set('order_status', orderStatus)
      if (paymentStatus) params.set('payment_status', paymentStatus)
      if (source) params.set('source', source)
      const res = await api.getOrders(`?${params.toString()}`)
      setOrders(res.orders)
      setTotal(res.total)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, orderStatus, paymentStatus, source])

  useEffect(() => { load() }, [load])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  async function handleExport() {
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (orderStatus) params.set('order_status', orderStatus)
    if (paymentStatus) params.set('payment_status', paymentStatus)
    if (source) params.set('source', source)
    const urlParams = params.toString() ? `?${params.toString()}` : ''
    try {
      const res = await fetch(`/api/orders/export${urlParams}`, { headers: { 'Content-Type': 'application/json' } })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `orders-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Orders</h1>
          <p className="text-sm text-gray-500">{loading ? 'Loading...' : `${total} order${total === 1 ? '' : 's'}`}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50">
            <Download className="h-4 w-4" /> Export CSV
          </button>
          <button onClick={() => router.push('/dashboard/orders/new')} className="flex items-center gap-2 rounded-xl bg-charcoal px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            <Plus className="h-4 w-4" /> Create order
          </button>
        </div>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="relative md:col-span-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search by order # / customer / phone"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="pl-9"
            />
          </div>
          <Select value={orderStatus} onChange={e => { setOrderStatus(e.target.value); setPage(1) }}>
            <option value="">All order statuses</option>
            {ORDER_STATUSES.map(s => <option key={s} value={s}>{humanize(s)}</option>)}
          </Select>
          <Select value={paymentStatus} onChange={e => { setPaymentStatus(e.target.value); setPage(1) }}>
            <option value="">All payments</option>
            {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{humanize(s)}</option>)}
          </Select>
          <Select value={source} onChange={e => { setSource(e.target.value); setPage(1) }}>
            <option value="">All sources</option>
            {Object.entries(ORDER_SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
      </Card>

      {loading && orders.length === 0 ? (
        <Card><TableSkeleton rows={8} cols={6} /></Card>
      ) : error && orders.length === 0 ? (
        <EmptyState title="Couldn't load orders" description={error} />
      ) : orders.length === 0 ? (
        <EmptyState
          title="No orders found"
          description="Try adjusting your filters, or create a new order."
          action={<Link href="/dashboard/orders/new" className="rounded-xl bg-charcoal px-4 py-2 text-sm font-semibold text-white">Create order</Link>}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-3 font-semibold">Order</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Total</th>
                  <th className="px-4 py-3 font-semibold">Payment</th>
                  <th className="px-4 py-3 font-semibold">Fulfillment</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o: any) => (
                  <tr key={o.id} className="cursor-pointer border-b border-gray-50 transition hover:bg-gray-50/60" onClick={() => router.push(`/dashboard/orders/${o.id}`)}>
                    <td className="px-4 py-3 font-semibold">{o.orderNumber}</td>
                    <td className="px-4 py-3">{o.customer?.fullName ?? '—'}</td>
                    <td className="px-4 py-3 font-medium">{formatMoney(o.totalAmount, o.currency)}</td>
                    <td className="px-4 py-3"><Badge>{o.paymentStatus}</Badge></td>
                    <td className="px-4 py-3"><Badge>{o.fulfillmentSummaryStatus}</Badge></td>
                    <td className="px-4 py-3"><Badge>{o.orderStatus}</Badge></td>
                    <td className="px-4 py-3 text-gray-500">{formatShortDate(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm">
            <span className="text-gray-500">
              Page {page} of {totalPages} · {total} results
            </span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-1.5 font-semibold disabled:opacity-40 hover:bg-gray-50">
                <ChevronLeft className="h-4 w-4" /> Prev
              </button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-1.5 font-semibold disabled:opacity-40 hover:bg-gray-50">
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </Card>
      )}

      {loading && orders.length > 0 && <p className="text-center text-xs text-gray-400">Updating…</p>}
      <p className="text-xs text-gray-400">Fulfillment summary: {FULFILLMENT_SUMMARY_STATUSES.map(s => humanize(s)).join(', ')}.</p>
    </div>
  )
}