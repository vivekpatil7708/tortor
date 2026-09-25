'use client'

import { useEffect, useState, Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { formatMoney, formatDateTime, humanize } from '@/lib/ui-format'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { PackageSearch, CheckCircle2, Truck, XCircle, Loader2, Phone, Mail, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

type TrackEvent = { label: string; status: string; location: string | null; at: string }
type TrackPackage = {
  courier_provider: string | null
  provider: string | null
  tracking_number: string | null
  awb_number: string | null
  tracking_url: string | null
  package_status: string
  estimated_delivery_at: string | null
  return_tracking_number: string | null
  events: TrackEvent[]
}
type TrackFulfillment = {
  id: string
  fulfillment_number: string
  fulfillment_type: string
  status: string
  items: Array<{ name: string; quantity: number }>
  packages: TrackPackage[]
}
type TrackData = {
  order: {
    order_number: string
    created_at: string
    currency: string
    total_amount: number
    fulfillment_summary_status: string
    order_status: string
    customer_name: string | null
    customer_note: string | null
    shipping_address: Record<string, unknown> | null
  }
  merchant: { business_name: string; logo_url: string | null; support_email: string | null; support_phone: string | null }
  items: Array<{ name: string; sku: string | null; quantity: number; unit_price: number; line_total: number }>
  fulfillments: TrackFulfillment[]
}

function TrackContent() {
  const { orderNumber } = useParams<{ orderNumber: string }>()
  const search = useSearchParams()
  const [data, setData] = useState<TrackData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = search.get('token') ?? ''
    api.getTrack<TrackData>(orderNumber, token)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [orderNumber, search])

  const packages = data?.fulfillments.flatMap(f => f.packages) ?? []
  const shippedQty = data?.fulfillments.reduce((s, f) => s + f.items.reduce((q, i) => q + i.quantity, 0), 0) ?? 0
  const orderedQty = data?.items.reduce((s, i) => s + i.quantity, 0) ?? 0
  const partial = orderedQty > shippedQty

  return (
    <div className="min-h-screen bg-cream px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-charcoal text-white">
            <Truck className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-extrabold">Track your order</h1>
          {data && <p className="text-sm text-gray-500">{data.merchant.business_name}</p>}
        </div>

        {loading && (
          <div className="space-y-4 rounded-3xl border border-white/80 bg-white/70 p-6 backdrop-blur">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-24" />
            <Skeleton className="h-40" />
          </div>
        )}

        {error && !loading && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center">
            <XCircle className="mx-auto mb-3 h-10 w-10 text-red-400" />
            <p className="font-semibold text-red-700">We couldn&apos;t find that order.</p>
            <p className="mt-1 text-sm text-red-600">{error.replace(/^Error:\s*/, '')}</p>
            <p className="mt-4 text-xs text-red-400">Double-check the link you were sent — it includes a private tracking token.</p>
          </div>
        )}

        {data && (
          <div className="space-y-4">
            <div className="rounded-3xl border border-white/80 bg-white/70 p-6 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Order</p>
                  <p className="text-lg font-extrabold">{data.order.order_number}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge>{humanize(data.order.fulfillment_summary_status)}</Badge>
                  <span className="text-xs text-gray-400">Placed {formatDateTime(data.order.created_at)}</span>
                </div>
              </div>
              {data.order.shipping_address && (
                <p className="mt-3 flex items-start gap-1.5 border-t border-gray-100 pt-3 text-xs text-gray-500">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {String(data.order.shipping_address.recipient_name ?? '')} · {String(data.order.shipping_address.line1 ?? '')},{' '}
                    {String(data.order.shipping_address.city ?? '')} {String(data.order.shipping_address.pincode ?? '')}
                  </span>
                </p>
              )}
              {partial && (
                <p className="mt-3 text-xs font-medium text-amber-600">
                  {shippedQty} of {orderedQty} items shipped so far — the rest will follow in another shipment.
                </p>
              )}
            </div>

            {packages.length === 0 ? (
              <div className="rounded-3xl border border-white/80 bg-white/70 p-8 text-center backdrop-blur">
                <PackageSearch className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                <p className="font-semibold text-gray-700">No shipments yet</p>
                <p className="mt-1 text-sm text-gray-500">Your order is being prepared. We&apos;ll update this page once it ships.</p>
              </div>
            ) : (
              packages.map((pkg, i) => (
                <div key={i} className="rounded-3xl border border-white/80 bg-white/70 p-6 backdrop-blur">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Package {i + 1} of {packages.length}</p>
                      <p className="font-bold">{pkg.courier_provider ?? humanize(pkg.provider ?? 'courier')}{pkg.tracking_number ? ` · #${pkg.tracking_number}` : ''}</p>
                      {pkg.estimated_delivery_at && (
                        <p className="text-xs text-gray-500">Estimated delivery · {formatDateTime(pkg.estimated_delivery_at)}</p>
                      )}
                    </div>
                    <Badge>{humanize(pkg.package_status ?? 'not_shipped')}</Badge>
                  </div>

                  {pkg.tracking_url && (
                    <a href={pkg.tracking_url} target="_blank" rel="noreferrer" className="mb-4 inline-block text-sm font-semibold text-primary-600 hover:underline">
                      Track with courier ↗
                    </a>
                  )}

                  {pkg.events.length === 0 ? (
                    <p className="text-sm text-gray-500">Tracking events haven&apos;t been added yet.</p>
                  ) : (
                    <ol className="relative space-y-4 border-l-2 border-gray-100 pl-5">
                      {pkg.events.map((ev, idx) => (
                        <li key={idx} className="relative">
                          <span
                            className={cn(
                              'absolute -left-[27px] top-1 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white',
                              ev.status === 'delivered' ? 'bg-green-500' : ev.status === 'delivery_failed' || ev.status === 'returned' || ev.status === 'cancelled' ? 'bg-red-500' : 'bg-primary-500'
                            )}
                          >
                            {ev.status === 'delivered' ? (
                              <CheckCircle2 className="h-3 w-3 text-white" />
                            ) : (
                              <Loader2 className="h-3 w-3 text-white" />
                            )}
                          </span>
                          <p className="text-sm font-semibold text-gray-800">{ev.label}</p>
                          {ev.location && <p className="text-sm text-gray-500">{ev.location}</p>}
                          <p className="text-xs text-gray-400">{formatDateTime(ev.at)}</p>
                        </li>
                      ))}
                    </ol>
                  )}

                  {pkg.return_tracking_number && (
                    <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
                      This package is being returned to the seller. Return tracking: #{pkg.return_tracking_number}
                    </p>
                  )}
                </div>
              ))
            )}

            <div className="rounded-3xl border border-white/80 bg-white/70 p-6 backdrop-blur">
              <h2 className="mb-3 font-bold">Items</h2>
              <div className="space-y-2">
                {data.items.map((it, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{it.name} <span className="text-gray-400">× {it.quantity}</span></span>
                    <span>{formatMoney(it.unit_price * it.quantity, data.order.currency)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-1 border-t border-gray-100 pt-3 text-sm">
                <div className="flex justify-between border-t border-gray-100 pt-2 font-extrabold">
                  <span>Total</span><span>{formatMoney(data.order.total_amount, data.order.currency)}</span>
                </div>
              </div>
              {data.order.customer_note && (
                <p className="mt-3 rounded-xl bg-gray-50 p-3 text-xs text-gray-500">Your note: {data.order.customer_note}</p>
              )}
              <div className="mt-4 flex flex-col items-center gap-1 border-t border-gray-100 pt-3 text-xs text-gray-400">
                <p className="text-center">Powered by ToroPay</p>
                {(data.merchant.support_email || data.merchant.support_phone) && (
                  <p className="flex items-center gap-3">
                    {data.merchant.support_email && (
                      <a href={`mailto:${data.merchant.support_email}`} className="inline-flex items-center gap-1 font-medium text-primary-600 hover:underline">
                        <Mail className="h-3 w-3" /> {data.merchant.support_email}
                      </a>
                    )}
                    {data.merchant.support_phone && (
                      <a href={`tel:${data.merchant.support_phone}`} className="inline-flex items-center gap-1 font-medium text-primary-600 hover:underline">
                        <Phone className="h-3 w-3" /> {data.merchant.support_phone}
                      </a>
                    )}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function TrackPage() {
  return (
    <Suspense>
      <TrackContent />
    </Suspense>
  )
}