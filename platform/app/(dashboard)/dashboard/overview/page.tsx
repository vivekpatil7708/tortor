'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { formatMoney, formatShortDate, humanize } from '@/lib/ui-format'
import { ShoppingBag, Users, PackageSearch, Truck, IndianRupee, TrendingUp, ArrowRight } from 'lucide-react'

type Overview = {
  merchant: { id: string; businessName: string }
  totals: {
    totalOrders: number
    totalRevenue: number
    totalCustomers: number
    totalProducts: number
    pendingPayments: number
    openOrders: number
    unfulfilledOrders: number
    shipmentsInTransit: number
    lowStockProducts: number
  }
  recentOrders: Record<string, unknown>[]
  statusBreakdown: Record<string, number>
  needsAttention: Record<string, unknown>[]
  lowStock: Record<string, unknown>[]
  recentActivities: { id: string; type: string; label: string; happenedAt: string }[]
}

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getOverview<Overview>()
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-extrabold">Overview</h1>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-extrabold">Overview</h1>
        <EmptyState title="Couldn't load overview" description={error} />
      </div>
    )
  }

  const t = data.totals

  const cards = [
    { label: 'Total revenue', value: formatMoney(t.totalRevenue), icon: IndianRupee, tone: 'text-green-600', sub: `${t.totalOrders} orders`, href: '/dashboard/orders' },
    { label: 'Total customers', value: t.totalCustomers.toLocaleString('en-IN'), icon: Users, tone: 'text-blue-600', sub: 'registered customers', href: '/dashboard/customers' },
    { label: 'Active products', value: t.totalProducts.toLocaleString('en-IN'), icon: PackageSearch, tone: 'text-violet-600', sub: t.lowStockProducts > 0 ? `${t.lowStockProducts} low in stock` : 'all stocked', href: '/dashboard/products' },
    { label: 'Open orders', value: t.openOrders.toLocaleString('en-IN'), icon: ShoppingBag, tone: 'text-amber-600', sub: `${t.unfulfilledOrders} awaiting fulfillment`, href: '/dashboard/orders' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Welcome back, {data.merchant.businessName} 👋</h1>
          <p className="text-sm text-gray-500">Here&apos;s what&apos;s happening with your orders today.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map(c => (
          <Link key={c.label} href={c.href}>
            <Card className="transition hover:border-charcoal/20 hover:shadow-md">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-500">{c.label}</p>
                  <p className="mt-1 text-2xl font-extrabold">{c.value}</p>
                  <p className={`mt-1 text-xs ${c.tone}`}>{c.sub}</p>
                </div>
                <c.icon className="h-5 w-5 text-gray-300" />
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Recent orders</h3>
              <Link href="/dashboard/orders" className="flex items-center gap-1 text-sm font-semibold text-primary-600 hover:underline">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {data.recentOrders.length === 0 ? (
              <EmptyState
                title="No orders yet"
                description="Create your first order to start fulfilling."
                action={<Link href="/dashboard/orders/new" className="rounded-xl bg-charcoal px-4 py-2 text-sm font-semibold text-white hover:opacity-90">Create order</Link>}
              />
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                      <th className="pb-2 pr-4 font-semibold">Order</th>
                      <th className="pb-2 pr-4 font-semibold">Customer</th>
                      <th className="pb-2 pr-4 font-semibold">Total</th>
                      <th className="pb-2 pr-4 font-semibold">Payment</th>
                      <th className="pb-2 pr-4 font-semibold">Status</th>
                      <th className="pb-2 font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentOrders.map((o: any) => (
                      <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                        <td className="py-3 pr-4 font-semibold">
                          <Link href={`/dashboard/orders/${o.id}`} className="hover:underline">{o.orderNumber}</Link>
                        </td>
                        <td className="py-3 pr-4">{o.customer?.fullName ?? '—'}</td>
                        <td className="py-3 pr-4 font-medium">{formatMoney(o.totalAmount, o.currency)}</td>
                        <td className="py-3 pr-4"><Badge>{o.paymentStatus}</Badge></td>
                        <td className="py-3 pr-4"><Badge>{o.orderStatus}</Badge></td>
                        <td className="py-3 text-gray-500">{formatShortDate(o.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h3 className="font-bold">Status breakdown</h3>
            <div className="mt-3 space-y-2">
              {Object.entries(data.statusBreakdown).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{humanize(k)}</span>
                  <span className="font-semibold">{v}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="font-bold">Needs attention</h3>
            {data.needsAttention.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">All clear — nothing needs attention.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {data.needsAttention.map((o: any) => (
                  <li key={o.id} className="flex items-center justify-between gap-2">
                    <Link href={`/dashboard/orders/${o.id}`} className="truncate font-medium text-gray-700 hover:underline">{o.orderNumber}</Link>
                    <Badge tone="red">{humanize(o.fulfillmentSummaryStatus)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {data.lowStock.length > 0 && (
            <Card>
              <h3 className="font-bold">Low stock</h3>
              <ul className="mt-2 space-y-1.5 text-sm">
                {data.lowStock.map((p: any) => (
                  <li key={p.id} className="flex items-center justify-between">
                    <span className="text-gray-700">{p.name}</span>
                    <span className="font-semibold text-red-600">{p.stockQuantity} left</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}