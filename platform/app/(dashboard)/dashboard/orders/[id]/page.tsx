'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { formatMoney, formatDateTime, humanize } from '@/lib/ui-format'

type Snapshot = { recipient_name?: string; line1?: string; line2?: string; city?: string; state?: string; pincode?: string; phone?: string } | null

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [order, setOrder] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.getOrder(id)
      setOrder(data.order)
    } catch {
      setError('Order not found')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded-xl bg-gray-100" />
      <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
    </div>
  )

  if (error || !order) return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-sm text-red-500">{error || 'Not found'}</p>
      <button onClick={() => router.push('/dashboard/orders')} className="mt-4 rounded-xl bg-charcoal px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">Back to Orders</button>
    </div>
  )

  const customer = order.customer as Record<string, unknown> | null
  const items = (order.order_items as Record<string, unknown>[] | undefined) ?? []
  const snapshot = order.shipping_address_snapshot as Snapshot
  const history = (order.status_history as Record<string, unknown>[] | undefined) ?? []
  const card = 'rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm'

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={() => router.push('/dashboard/orders')} className="mb-4 text-xs font-semibold text-gray-500 hover:text-charcoal">
        ← All orders
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{String(order.order_number ?? 'Order')}</h1>
          <p className="text-sm text-gray-500">Placed {formatDateTime(String(order.created_at))}</p>
        </div>
        <div className="flex gap-2">
          <Badge>{humanize(String(order.payment_status))}</Badge>
          <Badge>{humanize(String(order.order_status))}</Badge>
          <Badge>{humanize(String(order.fulfillment_summary_status))}</Badge>
        </div>
      </div>

      <div className={`${card} mb-4`}>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Items</h2>
        {items.length === 0 ? (
          <p className="text-sm text-gray-500">No items recorded on this order.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="pb-2">Item</th>
                <th className="pb-2 text-right">Qty</th>
                <th className="pb-2 text-right">Unit</th>
                <th className="pb-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={String(i.id)} className="border-t border-gray-100">
                  <td className="py-2">{String(i.product_name_snapshot ?? '—')}</td>
                  <td className="py-2 text-right">{String(i.quantity_ordered ?? 1)}</td>
                  <td className="py-2 text-right">{formatMoney(Number(i.unit_price))}</td>
                  <td className="py-2 text-right font-semibold">{formatMoney(Number(i.line_total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <dl className="mt-4 space-y-1 border-t border-gray-100 pt-4 text-sm">
          <Line label="Subtotal" value={formatMoney(Number(order.subtotal_amount))} />
          {Number(order.discount_amount) > 0 && <Line label="Discount" value={`− ${formatMoney(Number(order.discount_amount))}`} />}
          {Number(order.shipping_amount) > 0 && <Line label="Shipping" value={formatMoney(Number(order.shipping_amount))} />}
          {Number(order.tax_amount) > 0 && <Line label="Tax" value={formatMoney(Number(order.tax_amount))} />}
          <Line label="Total" value={formatMoney(Number(order.total_amount))} strong />
        </dl>
      </div>

      <div className={`${card} mb-4`}>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Customer</h2>
        {customer ? (
          <div className="text-sm">
            <p className="font-semibold">{String(customer.full_name ?? '—')}</p>
            {customer.phone ? <p className="text-gray-500">{String(customer.phone)}</p> : null}
            {customer.email ? <p className="text-gray-500">{String(customer.email)}</p> : null}
            <button onClick={() => router.push(`/dashboard/customers?open=${String(customer.id)}`)}
              className="mt-2 text-xs font-semibold text-charcoal underline">View customer</button>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No customer record — this was a guest checkout.</p>
        )}
      </div>

      {snapshot && (
        <div className={`${card} mb-4`}>
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Shipping address</h2>
          <address className="text-sm not-italic text-gray-600">
            {snapshot.recipient_name && <p className="font-semibold text-charcoal">{snapshot.recipient_name}</p>}
            {[snapshot.line1, snapshot.line2, snapshot.city].filter(Boolean).join(', ')}
            {(snapshot.state || snapshot.pincode) && <p>{[snapshot.state, snapshot.pincode].filter(Boolean).join(' ')}</p>}
          </address>
        </div>
      )}

      {order.customer_note ? (
        <div className={`${card} mb-4`}>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Customer note</h2>
          <p className="text-sm text-gray-600">{String(order.customer_note)}</p>
        </div>
      ) : null}

      {history.length > 0 && (
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold text-gray-700">History</h2>
          <ul className="space-y-2 text-sm">
            {history.map(h => (
              <li key={String(h.id)} className="border-t border-gray-100 pt-2 first:border-0 first:pt-0">
                <span className="text-gray-500">{formatDateTime(String(h.created_at))}</span>
                {' — '}
                {humanize(String(h.new_status ?? ''))}
                {h.previous_status ? <span className="text-gray-400"> (was {humanize(String(h.previous_status))})</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? 'font-bold text-charcoal' : 'text-gray-600'}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
