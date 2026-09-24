'use client'

import { useEffect, useState, Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { formatMoney, formatDateTime, humanize } from '@/lib/ui-format'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { PackageSearch, CheckCircle2, Truck, XCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type TrackData = {
  orderNumber: string
  merchantName: string
  status: string
  fulfillmentSummaryStatus: string
  customerName?: string | null
  createdAt: string
  currency: string
  totalAmount: number
  subtotalAmount: number
  discountAmount: number | null
  shippingAmount: number | null
  taxAmount: number | null
  orderItems: Array<{ productNameSnapshot: string; skuSnapshot: string | null; unitPrice: number; quantityOrdered: number }>
  packages: Array<{
    id: string
    trackingNumber: string | null
    courierProvider: string | null
    packageStatus: string | null
    trackingUrl: string | null
    events: Array<{ id: string; eventLabel: string; eventStatus: string; location: string | null; eventAt: string }>
  }>
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

  return (
    <div className="min-h-screen bg-cream px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-charcoal text-white">
            <Truck className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-extrabold">Track your order</h1>
          {data && <p className="text-sm text-gray-500">{data.merchantName}</p>}
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
                  <p className="text-lg font-extrabold">{data.orderNumber}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge>{data.fulfillmentSummaryStatus}</Badge>
                  <span className="text-xs text-gray-400">Placed {formatDateTime(data.createdAt)}</span>
                </div>
              </div>
            </div>

            {data.packages.length === 0 ? (
              <div className="rounded-3xl border border-white/80 bg-white/70 p-8 text-center backdrop-blur">
                <PackageSearch className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                <p className="font-semibold text-gray-700">No shipments yet</p>
                <p className="mt-1 text-sm text-gray-500">Your order is being prepared. We&apos;ll update this page once it ships.</p>
              </div>
            ) : (
              data.packages.map((pkg, i) => (
                <div key={pkg.id} className="rounded-3xl border border-white/80 bg-white/70 p-6 backdrop-blur">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Package {i + 1} of {data.packages.length}</p>
                      <p className="font-bold">{pkg.courierProvider ?? 'Your courier'}{pkg.trackingNumber ? ` · #${pkg.trackingNumber}` : ''}</p>
                    </div>
                    <Badge>{pkg.packageStatus ?? 'not_shipped'}</Badge>
                  </div>

                  {pkg.trackingUrl && (
                    <a href={pkg.trackingUrl} target="_blank" rel="noreferrer" className="mb-4 inline-block text-sm font-semibold text-primary-600 hover:underline">
                      Track with courier ↗
                    </a>
                  )}

                  {pkg.events.length === 0 ? (
                    <p className="text-sm text-gray-500">Tracking events haven&apos;t been added yet.</p>
                  ) : (
                    <ol className="relative space-y-4 border-l-2 border-gray-100 pl-5">
                      {pkg.events.map(ev => (
                        <li key={ev.id} className="relative">
                          <span
                            className={cn(
                              'absolute -left-[27px] top-1 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white',
                              ev.eventStatus === 'delivered' ? 'bg-green-500' : ev.eventStatus === 'delivery_failed' || ev.eventStatus === 'returned' ? 'bg-red-500' : 'bg-primary-500'
                            )}
                          >
                            {ev.eventStatus === 'delivered' ? (
                              <CheckCircle2 className="h-3 w-3 text-white" />
                            ) : (
                              <Loader2 className="h-3 w-3 text-white" />
                            )}
                          </span>
                          <p className="text-sm font-semibold text-gray-800">{ev.eventLabel}</p>
                          {ev.location && <p className="text-sm text-gray-500">{ev.location}</p>}
                          <p className="text-xs text-gray-400">{formatDateTime(ev.eventAt)}</p>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))
            )}

            <div className="rounded-3xl border border-white/80 bg-white/70 p-6 backdrop-blur">
              <h2 className="mb-3 font-bold">Items</h2>
              <div className="space-y-2">
                {data.orderItems.map((it, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{it.productNameSnapshot} <span className="text-gray-400">× {it.quantityOrdered}</span></span>
                    <span>{formatMoney(it.unitPrice * it.quantityOrdered, data.currency)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-1 border-t border-gray-100 pt-3 text-sm">
                <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatMoney(data.subtotalAmount, data.currency)}</span></div>
                {(data.discountAmount ?? 0) > 0 && <div className="flex justify-between text-gray-500"><span>Discount</span><span>−{formatMoney(data.discountAmount ?? 0, data.currency)}</span></div>}
                {(data.shippingAmount ?? 0) > 0 && <div className="flex justify-between text-gray-500"><span>Shipping</span><span>{formatMoney(data.shippingAmount ?? 0, data.currency)}</span></div>}
                <div className="flex justify-between border-t border-gray-100 pt-2 font-extrabold">
                  <span>Total</span><span>{formatMoney(data.totalAmount, data.currency)}</span>
                </div>
              </div>
              <p className="mt-4 text-center text-xs text-gray-400">Powered by ToroPay · Need help? Contact the seller.</p>
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