'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TableSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Select } from '@/components/ui/form'
import { formatMoney, humanize, PRODUCT_STATUSES, PRODUCT_TYPES } from '@/lib/ui-format'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'

export default function ProductsPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const pageSize = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
      if (status) params.set('status', status)
      if (type) params.set('product_type', type)
      const res = await api.getProducts(`?${params.toString()}`)
      setProducts(res.products)
      setTotal(res.total)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [page, status, type])

  useEffect(() => { load() }, [load])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Products</h1>
          <p className="text-sm text-gray-500">{loading ? 'Loading…' : `${total} product${total === 1 ? '' : 's'}`}</p>
        </div>
        <button onClick={() => router.push('/dashboard/products/new')} className="flex items-center gap-2 rounded-xl bg-charcoal px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
          <Plus className="h-4 w-4" /> Add product
        </button>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:max-w-md">
          <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
            <option value="">All statuses</option>
            {PRODUCT_STATUSES.map(s => <option key={s} value={s}>{humanize(s)}</option>)}
          </Select>
          <Select value={type} onChange={e => { setType(e.target.value); setPage(1) }}>
            <option value="">All types</option>
            {PRODUCT_TYPES.map(t => <option key={t} value={t}>{humanize(t)}</option>)}
          </Select>
        </div>
      </Card>

      {loading && products.length === 0 ? (
        <Card><TableSkeleton rows={6} cols={5} /></Card>
      ) : error && products.length === 0 ? (
        <EmptyState title="Couldn't load products" description={error} />
      ) : products.length === 0 ? (
        <EmptyState
          title="No products found"
          description="Add your products so you can attach them to orders."
          action={<button onClick={() => router.push('/dashboard/products/new')} className="rounded-xl bg-charcoal px-4 py-2 text-sm font-semibold text-white">Add product</button>}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">SKU</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 text-right font-semibold">Price</th>
                  <th className="px-4 py-3 text-center font-semibold">Stock</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p: any) => (
                  <tr key={p.id} className="cursor-pointer border-b border-gray-50 transition hover:bg-gray-50/60" onClick={() => router.push(`/dashboard/products/${p.id}`)}>
                    <td className="px-4 py-3 font-semibold">{p.name}</td>
                    <td className="px-4 py-3 text-gray-500">{p.sku ?? '—'}</td>
                    <td className="px-4 py-3"><Badge tone="gray">{humanize(p.productType)}</Badge></td>
                    <td className="px-4 py-3 text-right font-medium">
                      <span className="align-baseline">{formatMoney(p.price)}</span>
                      {p.compareAtPrice != null && p.compareAtPrice > p.price && (
                        <span className="ml-1 align-baseline text-xs text-gray-400 line-through">{formatMoney(p.compareAtPrice)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.productType === 'physical' ? (
                        <span className={p.stockQuantity != null && p.stockQuantity <= (p.lowStockThreshold ?? 5) ? 'font-semibold text-red-600' : 'text-gray-700'}>
                          {p.stockQuantity ?? '—'}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3"><Badge>{p.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm">
            <span className="text-gray-500">Page {page} of {totalPages} · {total} results</span>
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
    </div>
  )
}