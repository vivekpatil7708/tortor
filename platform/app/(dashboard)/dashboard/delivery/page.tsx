'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TableSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/ui/dialog'
import { formatShortDate, humanize } from '@/lib/ui-format'
import { Truck, FileDown, RefreshCw, Trash2, Undo2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

type Row = {
  packageId: string
  fulfillmentId: string
  fulfillmentNumber: string
  orderNumber: string
  orderId: string
  customerName: string | null
  orderStatus: string
  fulfillmentStatus: string
  fulfillmentType: string
  itemCount: number
  trackingNumber: string | null
  awbNumber: string | null
  courierProvider: string | null
  provider: string | null
  packageStatus: string
  estimatedDeliveryAt: string | null
  shippedAt: string | null
  pickedUpAt: string | null
  deliveredAt: string | null
  rtoInitiatedAt: string | null
  labelUrl: string | null
  returnTrackingNumber: string | null
  lastProviderSyncAt: string | null
  createdAt: string
  updatedAt: string
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'to_pack', label: 'To pack' },
  { key: 'in_transit', label: 'In transit' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'issues', label: 'Issues' },
] as const

export default function DeliveryPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [tab, setTab] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [courier, setCourier] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const [cancelFor, setCancelFor] = useState<Row | null>(null)
  const [rtoFor, setRtoFor] = useState<Row | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (tab && tab !== 'all') params.set('tab', tab)
      if (search) params.set('search', search)
      if (courier !== 'all') params.set('courier', courier)
      const qs = params.toString()
      const res = await api.getDelivery(qs ? `?${qs}` : undefined)
      setRows(res.rows as unknown as Row[])
      setCounts(res.counts)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [tab, search, courier])

  useEffect(() => { load() }, [load])

  const couriers = useMemo(() => Array.from(new Set(rows.map(r => r.courierProvider).filter(Boolean) as string[])), [rows])

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 3000) }

  async function action(pkg: Row, action: string, extra?: Record<string, unknown>) {
    setBusy(true)
    try {
      const res = await api.courierPackageAction(pkg.packageId, { action, ...extra })
      if (action === 'label' && res.result.label_url && typeof res.result.label_url === 'string') {
        window.open(res.result.label_url as string, '_blank', 'noopener,noreferrer')
      }
      flash(`${humanize(action)} · ${res.ok ? 'done' : 'failed'}`)
      load()
    } catch (e) {
      flash((e as Error).message.replace(/^Error:\s*/, ''))
    } finally {
      setBusy(false)
      setCancelFor(null)
      setRtoFor(null)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Delivery</h1>
        <p className="text-sm text-gray-500">Every package across your shipments — with courier tracking, labels and returns.</p>
      </div>

      {msg && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">{msg}</div>}

      <div className="flex flex-wrap items-center gap-2">
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
            <span className={cn('ml-1.5 text-xs', tab === t.key ? 'text-gray-300' : 'text-gray-500')}>{counts[t.key] ?? 0}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') setSearch(searchInput.trim()); }}
              placeholder="Search tracking / order…"
              className="w-56 rounded-full border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-charcoal"
            />
          </div>
          <select
            value={courier}
            onChange={e => setCourier(e.target.value)}
            className="rounded-full border border-gray-200 bg-white px-3 py-2 text-sm outline-none"
          >
            <option value="all">All couriers</option>
            {couriers.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <Card><TableSkeleton rows={6} cols={6} /></Card>
      ) : error && rows.length === 0 ? (
        <EmptyState title="Couldn't load shipments" description={error} />
      ) : rows.length === 0 ? (
        <EmptyState title="No packages here" description="Ship an order to see its packages, tracking and courier updates." />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3 font-semibold">Package / AWB</th>
                  <th className="px-4 py-3 font-semibold">Order</th>
                  <th className="px-4 py-3 font-semibold">Courier</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Shipped</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.packageId} className="border-b border-gray-50 transition hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/orders/${row.orderId}`} className="font-semibold hover:underline">
                        {row.fulfillmentNumber}
                      </Link>
                      {row.trackingNumber ? (
                        <span className="block font-mono text-xs text-gray-500"># {row.trackingNumber}</span>
                      ) : (
                        <span className="block text-xs text-gray-500">No tracking yet</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.orderNumber}
                      {row.customerName && <span className="block text-xs text-gray-500">{row.customerName}</span>}
                      {row.itemCount > 1 && <span className="block text-xs text-gray-500">{row.itemCount} items</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {(row.courierProvider ?? humanize(row.provider ?? '')) || '—'}
                      {row.returnTrackingNumber && <span className="mt-0.5 block text-xs font-semibold text-amber-600">RTO #{row.returnTrackingNumber}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Truck className={cn('h-3.5 w-3.5', ['delivery_failed', 'returned', 'cancelled'].includes(row.packageStatus) ? 'text-red-500' : 'text-gray-300')} />
                        <Badge>{humanize(row.packageStatus)}</Badge>
                      </div>
                      {row.estimatedDeliveryAt && (
                        <span className="mt-0.5 block text-xs text-gray-500">ETA {formatShortDate(row.estimatedDeliveryAt)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{row.shippedAt ? formatShortDate(row.shippedAt) : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {row.labelUrl && (
                          <a href={row.labelUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold hover:bg-gray-100">
                            <FileDown className="mr-1 inline h-3 w-3" /> Label
                          </a>
                        )}
                        <button
                          onClick={() => action(row, 'sync')}
                          disabled={busy}
                          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                          title="Pull latest tracking from the courier"
                        >
                          <RefreshCw className="mr-1 inline h-3 w-3" /> Sync
                        </button>
                        {!['delivered', 'returned', 'cancelled'].includes(row.packageStatus) && (
                          <>
                            <button
                              onClick={() => setCancelFor(row)}
                              disabled={busy}
                              className="rounded-lg border border-red-200 bg-white px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
                            >
                              <Trash2 className="mr-1 inline h-3 w-3" /> Cancel
                            </button>
                            <button
                              onClick={() => setRtoFor(row)}
                              disabled={busy}
                              className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-40"
                            >
                              <Undo2 className="mr-1 inline h-3 w-3" /> Return
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={!!cancelFor}
        onClose={() => setCancelFor(null)}
        onConfirm={() => cancelFor && action(cancelFor, 'cancel')}
        title="Cancel this shipment?"
        message={cancelFor ? `The courier will be asked to cancel AWB ${cancelFor.trackingNumber ?? ''}.` : ''}
        confirmLabel="Cancel shipment"
        danger
        busy={busy}
      />
      <ConfirmDialog
        open={!!rtoFor}
        onClose={() => setRtoFor(null)}
        onConfirm={() => rtoFor && action(rtoFor, 'return')}
        title="Initiate a return?"
        message={rtoFor ? `An RTO shipment will be created for ${rtoFor.trackingNumber ?? 'this package'}.` : ''}
        confirmLabel="Start return"
        busy={busy}
      />
    </div>
  )
}