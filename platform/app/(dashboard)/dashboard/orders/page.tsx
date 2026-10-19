'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { useOrderPages } from '@/lib/use-order-pages'
import { exportToCSV } from '@/lib/export-csv'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatMoney, formatShortDate, humanize, ORDER_STATUSES, FULFILLMENT_SUMMARY_STATUSES, ORDER_SOURCES } from '@/lib/ui-format'

/** The longest search the server accepts. */
const MAX_SEARCH = 64

const PAYMENT_TABS = [
  { value: '', label: 'All' },
  ...['pending', 'paid', 'failed', 'refunded'].map(v => ({ value: v, label: humanize(v) })),
]

export default function OrdersPage() {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  // Search once typing pauses, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const [paymentStatus, setPaymentStatus] = useState('')
  const [orderStatus, setOrderStatus] = useState('')
  const [fulfillmentStatus, setFulfillmentStatus] = useState('')
  const [source, setSource] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const filters = {
    q: query || undefined,
    payment_status: paymentStatus || undefined,
    order_status: orderStatus || undefined,
    fulfillment_status: fulfillmentStatus || undefined,
    source: source || undefined,
    from: fromDate || undefined,
    to: toDate || undefined,
  }
  const { rows: orders, total, loading, error, hasMore, loadMore, reload } = useOrderPages(filters)

  const [exporting, setExporting] = useState('')
  const [exportError, setExportError] = useState('')

  const anyFilter = Boolean(query || paymentStatus || orderStatus || fulfillmentStatus || source || fromDate || toDate)

  function clearFilters() {
    setSearch('')
    setPaymentStatus('')
    setOrderStatus('')
    setFulfillmentStatus('')
    setSource('')
    setFromDate('')
    setToDate('')
  }

  async function handleExport() {
    if (exporting) return
    setExportError('')
    setExporting('Preparing…')
    try {
      // Every order matching the filters, not only the ones loaded on screen.
      const all = await fetchAllOrders(filters, (loaded, count) =>
        setExporting(`Preparing ${loaded}${count ? ` of ${count}` : ''}…`))

      exportToCSV(`toropay-orders${anyFilter ? '-filtered' : ''}`, [
        { key: 'order_number', label: 'Order Number' },
        { key: 'created_at', label: 'Date' },
        { key: 'customer_name', label: 'Customer' },
        { key: 'customer_phone', label: 'Phone' },
        { key: 'customer_email', label: 'Email' },
        { key: 'item_count', label: 'Items' },
        { key: 'total_amount', label: 'Total' },
        { key: 'payment_status', label: 'Payment Status' },
        { key: 'order_status', label: 'Order Status' },
        { key: 'fulfillment_summary_status', label: 'Fulfillment' },
        { key: 'source', label: 'Source' },
        { key: 'merchant_order_reference', label: 'Your Reference' },
      ], all)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not export')
    } finally {
      setExporting('')
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
          <p className="text-sm text-gray-500">Orders placed through your links, website and by hand.</p>
        </div>
        <button onClick={handleExport} disabled={!total || !!exporting}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold text-charcoal transition-colors hover:bg-gray-50 disabled:opacity-40">
          {exporting || 'Export to Excel'}
        </button>
      </div>
      {exportError && <p className="mb-4 text-sm text-red-500">Export failed: {exportError}</p>}

      <div className="relative mb-3 w-full sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden />
        <input type="search" value={search} maxLength={MAX_SEARCH} onChange={e => setSearch(e.target.value)}
          placeholder="Search order number, name, phone or email" aria-label="Search orders"
          className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {PAYMENT_TABS.map(f => (
          <button key={f.value} onClick={() => setPaymentStatus(f.value)} aria-pressed={paymentStatus === f.value}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${paymentStatus === f.value ? 'bg-charcoal text-white' : 'bg-white/60 text-gray-500 hover:bg-white'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <select value={orderStatus} onChange={e => setOrderStatus(e.target.value)} aria-label="Order status"
          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 outline-none">
          <option value="">Any order status</option>
          {ORDER_STATUSES.map(s => <option key={s} value={s}>{humanize(s)}</option>)}
        </select>
        <select value={fulfillmentStatus} onChange={e => setFulfillmentStatus(e.target.value)} aria-label="Fulfillment status"
          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 outline-none">
          <option value="">Any fulfillment</option>
          {FULFILLMENT_SUMMARY_STATUSES.map(s => <option key={s} value={s}>{humanize(s)}</option>)}
        </select>
        <select value={source} onChange={e => setSource(e.target.value)} aria-label="Source"
          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 outline-none">
          <option value="">Any source</option>
          {Object.entries(ORDER_SOURCES).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} aria-label="From date"
          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 outline-none" />
        <span className="text-gray-500">to</span>
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} aria-label="To date"
          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 outline-none" />
        {anyFilter && (
          <button onClick={clearFilters} className="text-gray-500 hover:text-charcoal">Clear</button>
        )}
      </div>

      {total !== null && orders.length > 0 && (
        <p className="mb-2 text-xs text-gray-500">Showing {orders.length} of {total}</p>
      )}

      {loadErrorOrEmpty(orders.length, error, loading, query, anyFilter, reload) ?? (
        <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/60 backdrop-blur-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Fulfillment</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => {
                const id = String(o.id)
                const customer = o.customer as Record<string, unknown> | null
                return (
                  <tr key={id} className="border-t border-gray-100 hover:bg-white/70">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/orders/${id}`} className="font-semibold text-charcoal underline-offset-2 hover:underline">
                        {String(o.order_number ?? '—')}
                      </Link>
                      <p className="text-xs text-gray-500">
                        {(o.order_items as unknown[] | undefined)?.length ?? 0} item(s)
                        {o.source ? ` · ${ORDER_SOURCES[String(o.source)] ?? humanize(String(o.source))}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {customer
                        ? <>{String(customer.full_name ?? '—')}
                            {customer.phone ? <p className="text-xs text-gray-500">{String(customer.phone)}</p> : null}</>
                        : <span className="text-gray-400">Guest</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatShortDate(String(o.created_at))}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatMoney(Number(o.total_amount))}</td>
                    <td className="px-4 py-3"><Badge>{humanize(String(o.payment_status))}</Badge></td>
                    <td className="px-4 py-3"><Badge>{humanize(String(o.fulfillment_summary_status))}</Badge></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {orders.length > 0 && hasMore && (
        <div className="mt-4 text-center">
          {error && <p className="mb-2 text-xs text-red-500">Couldn&apos;t load more orders.</p>}
          <button onClick={loadMore} disabled={loading}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold text-charcoal hover:bg-gray-50 disabled:opacity-40">
            {loading ? 'Loading…' : error ? 'Retry' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * The empty, loading and error panels, or null when there are rows to show.
 * Kept out of the JSX above so the table stays readable.
 */
function loadErrorOrEmpty(
  count: number, error: string, loading: boolean, query: string, anyFilter: boolean, retry: () => void,
) {
  if (count > 0) return null
  if (error) {
    return (
      <div className="rounded-2xl border border-white/80 bg-white/60 p-12 text-center text-sm text-gray-500 backdrop-blur-sm">
        Couldn&apos;t load orders. <button onClick={retry} className="font-semibold text-charcoal underline">Retry</button>
      </div>
    )
  }
  if (loading) {
    return <div className="rounded-2xl border border-white/80 bg-white/60 p-12 text-center text-sm text-gray-500 backdrop-blur-sm">Loading…</div>
  }
  return (
    <EmptyState
      title={anyFilter ? 'No orders match these filters' : 'No orders yet'}
      description={anyFilter
        ? 'Try a different search or clear the filters.'
        : query
          ? `No orders match "${query}".`
          : 'Orders appear here when a customer pays through one of your links.'}
    />
  )
}

/** Every order matching the filters, fetched 200 at a time (for exports). */
async function fetchAllOrders(
  filters: Parameters<typeof api.orders>[0],
  onProgress?: (loaded: number, total: number | null) => void,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let total: number | null = null
  let cursor: string | undefined
  do {
    const page = await api.orders({ ...filters, limit: 200, cursor })
    if (total === null) total = page.total
    rows.push(...page.orders)
    onProgress?.(rows.length, total)
    if (page.next_cursor === cursor) break
    cursor = page.next_cursor ?? undefined
  } while (cursor)
  return rows
}
