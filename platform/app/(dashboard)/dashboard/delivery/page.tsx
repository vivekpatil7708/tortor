'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TableSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { formatShortDate, humanize } from '@/lib/ui-format'
import { Truck } from 'lucide-react'
import { cn } from '@/lib/utils'

type Row = {
  id: string
  fulfillmentNumber: string
  status: string
  fulfillmentType: string
  courierProvider: string | null
  trackingNumber: string | null
  isDelayed: boolean
  order: { id: string; orderNumber: string; customerName: string | null; paymentStatus: string } | null
  packages: Array<{ id: string; packageStatus: string | null; trackingNumber: string | null; courierProvider: string | null }>
}

const TABS = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'delivery_failed', label: 'Delivery failed' },
  { key: 'returned', label: 'Returned' },
] as const

export default function DeliveryPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [tab, setTab] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.getDelivery(tab ? `?status=${tab}` : undefined)
      setRows(res.rows as Row[])
      setCounts(res.counts)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Delivery</h1>
        <p className="text-sm text-gray-500">Track shipments, confirm deliveries, and surface failed/returned packages.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-semibold transition',
              tab === t.key ? 'bg-charcoal text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            )}
          >
            {t.label}
            <span className={cn('ml-1.5 text-xs', tab === t.key ? 'text-gray-300' : 'text-gray-400')}>{counts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {loading && rows.length === 0 ? (
        <Card><TableSkeleton rows={6} cols={5} /></Card>
      ) : error && rows.length === 0 ? (
        <EmptyState title="Couldn't load shipments" description={error} />
      ) : rows.length === 0 ? (
        <EmptyState title="No shipments here" description="Create fulfillments from an order to start shipping." />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-3 font-semibold">Fulfillment</th>
                  <th className="px-4 py-3 font-semibold">Order</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Courier / tracking</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f: any) => (
                  <tr key={f.id} className={cn('border-b border-gray-50 transition', f.isDelayed ? 'bg-red-50/40' : 'hover:bg-gray-50/60')}>
                    <td className="px-4 py-3 font-semibold">{f.fulfillmentNumber}</td>
                    <td className="px-4 py-3">
                      {f.order ? <Link href={`/dashboard/orders/${f.order.id}`} className="font-medium hover:underline">{f.order.orderNumber}</Link> : '—'}
                      {f.order?.customerName && <span className="block text-xs text-gray-400">{f.order.customerName}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{humanize(f.fulfillmentType)}</td>
                    <td className="px-4 py-3">
                      {f.trackingNumber ? (
                        <div>
                          <span className="block font-medium">{f.courierProvider ?? 'Courier'}</span>
                          <span className="font-mono text-xs text-gray-500">{f.trackingNumber}</span>
                        </div>
                      ) : <span className="text-gray-400">Not shipped yet</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Truck className={cn('h-3.5 w-3.5', f.isDelayed ? 'text-red-500' : 'text-gray-300')} />
                        <Badge tone={f.isDelayed ? 'red' : undefined}>{humanize(f.status)}</Badge>
                      </div>
                      {f.isDelayed && <span className="mt-0.5 block text-xs font-semibold text-red-600">Delayed</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatShortDate(f.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}