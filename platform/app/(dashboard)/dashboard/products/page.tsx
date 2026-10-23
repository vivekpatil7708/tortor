'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatMoney } from '@/lib/ui-format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadError } from '@/components/ui/load-error'
import { useToast } from '@/components/toast'
import { Plus, Search, Edit, Archive, AlertTriangle, X } from 'lucide-react'

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'archived', label: 'Archived' },
]

const PRODUCT_TYPES = [
  { value: 'physical', label: 'Physical' },
  { value: 'digital', label: 'Digital' },
  { value: 'service', label: 'Service' },
]

type Product = Record<string, unknown>

const emptyForm = {
  name: '',
  description: '',
  sku: '',
  price: '',
  compare_at_price: '',
  image_url: '',
  product_type: 'physical',
  status: 'active',
  stock_quantity: '',
  low_stock_threshold: '',
  hsn_code: '',
  tax_rate: '',
  tax_exempt: false,
}

export default function ProductsPage() {
  const { toast } = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function load() {
    setLoadState('loading')
    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search.trim())
    if (statusFilter !== 'all') params.set('status', statusFilter)
    params.set('page_size', '100')
    api.getProducts(params.toString() ? `?${params.toString()}` : '')
      .then((res: any) => {
        setProducts(res.products || [])
        setLoadState('ready')
      })
      .catch(() => setLoadState('failed'))
  }

  useEffect(() => { load() }, [statusFilter])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [search])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setModalOpen(true)
  }

  function openEdit(p: Product) {
    setEditing(p)
    setForm({
      name: String(p.name || ''),
      description: String(p.description || ''),
      sku: String(p.sku || ''),
      price: String(p.price ?? ''),
      compare_at_price: p.compare_at_price == null ? '' : String(p.compare_at_price),
      image_url: String(p.image_url || ''),
      product_type: String(p.product_type || 'physical'),
      status: String(p.status || 'active'),
      stock_quantity: p.stock_quantity == null ? '' : String(p.stock_quantity),
      low_stock_threshold: p.low_stock_threshold == null ? '' : String(p.low_stock_threshold),
      hsn_code: String(p.hsn_code || ''),
      tax_rate: p.tax_rate == null ? '' : String(p.tax_rate),
      tax_exempt: Boolean(p.tax_exempt),
    })
    setError('')
    setModalOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        description: form.description || null,
        sku: form.sku || null,
        price: Number(form.price),
        compare_at_price: form.compare_at_price === '' ? null : Number(form.compare_at_price),
        image_url: form.image_url || null,
        product_type: form.product_type,
        status: form.status,
        stock_quantity: form.stock_quantity === '' ? null : Number(form.stock_quantity),
        low_stock_threshold: form.low_stock_threshold === '' ? null : Number(form.low_stock_threshold),
        hsn_code: form.hsn_code || null,
        tax_rate: form.tax_rate === '' ? null : Number(form.tax_rate),
        tax_exempt: form.tax_exempt,
      }
      if (editing) {
        await api.updateProduct(String(editing.id), payload)
        toast('Product updated')
      } else {
        await api.createProduct(payload)
        toast('Product created')
      }
      setModalOpen(false)
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save product')
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive(p: Product) {
    if (!confirm(`Archive "${p.name}"? It will no longer appear in active product lists.`)) return
    try {
      await api.archiveProduct(String(p.id))
      toast('Product archived')
      load()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to archive product')
    }
  }

  function isLowStock(p: Product) {
    const stock = p.stock_quantity
    const threshold = p.low_stock_threshold
    if (stock == null || threshold == null) return false
    return Number(stock) <= Number(threshold)
  }

  const inputClass = 'w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200'
  const labelClass = 'mb-1 block text-xs font-semibold text-gray-600'

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="text-sm text-gray-500">Manage your product catalog for payment links.</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" /> Add New Product</Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden />
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, SKU or HSN" className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200" />
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-white/60 p-1">
          {STATUS_FILTERS.map(f => (
            <button key={f.value} onClick={() => setStatusFilter(f.value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${statusFilter === f.value ? 'bg-charcoal text-white' : 'text-gray-500 hover:text-charcoal'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loadState === 'failed' && <LoadError what="your products" onRetry={load} />}
      {loadState === 'loading' && <p className="py-12 text-center text-sm text-gray-500">Loading…</p>}
      {loadState === 'ready' && products.length === 0 && (
        <EmptyState title="No products yet" description="Add products to build your catalog and reuse them when creating payment links." action={<Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" /> Add New Product</Button>} />
      )}
      {loadState === 'ready' && products.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/60 backdrop-blur-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">HSN / Tax</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={String(p.id)} className="border-t border-gray-100 hover:bg-white/70">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{String(p.name)}</p>
                    {p.description ? <p className="max-w-xs truncate text-xs text-gray-500">{String(p.description)}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{p.sku ? String(p.sku) : '—'}</td>
                  <td className="px-4 py-3 capitalize text-gray-500">{String(p.product_type)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatMoney(Number(p.price))}</td>
                  <td className="px-4 py-3">
                    {p.stock_quantity == null ? <span className="text-gray-400">—</span> : (
                      <span className={`inline-flex items-center gap-1 ${isLowStock(p) ? 'text-red-600' : 'text-gray-600'}`}>
                        {isLowStock(p) && <AlertTriangle className="h-3.5 w-3.5" />}
                        {String(p.stock_quantity)}
                        {p.low_stock_threshold != null ? <span className="text-gray-400">/ {String(p.low_stock_threshold)}</span> : null}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {p.hsn_code ? <p>HSN: {String(p.hsn_code)}</p> : null}
                    {p.tax_exempt ? <p>Tax exempt</p> : p.tax_rate != null ? <p>{String(p.tax_rate)}%</p> : <p>—</p>}
                  </td>
                  <td className="px-4 py-3"><Badge tone={p.status === 'active' ? 'green' : p.status === 'draft' ? 'yellow' : 'gray'}>{String(p.status)}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(p)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-charcoal"><Edit className="h-4 w-4" /></button>
                      {p.status !== 'archived' && <button onClick={() => handleArchive(p)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600"><Archive className="h-4 w-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-8">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold">{editing ? 'Edit Product' : 'Add New Product'}</h2>
              <button onClick={() => setModalOpen(false)} className="rounded-lg p-1.5 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelClass}>Name *</label>
                  <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Price (INR) *</label>
                  <input required type="number" min="0" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Compare at price</label>
                  <input type="number" min="0" step="0.01" value={form.compare_at_price} onChange={e => setForm({ ...form, compare_at_price: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Product type *</label>
                  <select value={form.product_type} onChange={e => setForm({ ...form, product_type: e.target.value })} className={inputClass}>
                    {PRODUCT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Status</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={inputClass}>
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>SKU</label>
                  <input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Image URL</label>
                  <input value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Stock quantity</label>
                  <input type="number" min="0" value={form.stock_quantity} onChange={e => setForm({ ...form, stock_quantity: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Low stock threshold</label>
                  <input type="number" min="0" value={form.low_stock_threshold} onChange={e => setForm({ ...form, low_stock_threshold: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>HSN code</label>
                  <input value={form.hsn_code} onChange={e => setForm({ ...form, hsn_code: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Tax rate (%)</label>
                  <input type="number" min="0" max="100" step="0.01" value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: e.target.value })} className={inputClass} />
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <input type="checkbox" id="tax_exempt" checked={form.tax_exempt} onChange={e => setForm({ ...form, tax_exempt: e.target.checked })} />
                  <label htmlFor="tax_exempt" className="text-sm">Tax exempt</label>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Description</label>
                  <textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputClass} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Update Product' : 'Create Product'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
