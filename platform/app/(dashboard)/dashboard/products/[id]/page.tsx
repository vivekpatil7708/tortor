'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { ConfirmDialog } from '@/components/ui/dialog'
import { formatMoney, humanize, PRODUCT_STATUSES, PRODUCT_TYPES } from '@/lib/ui-format'
import { ArrowLeft, Trash2 } from 'lucide-react'

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [p, setP] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [editing, setEditing] = useState(false)

  const [form, setForm] = useState({ name: '', sku: '', description: '', price: '', compare_at_price: '', product_type: 'physical', status: 'active', stock_quantity: '', low_stock_threshold: '5' })

  function load() {
    setLoading(true)
    api.getProduct(id)
      .then(r => setP(r.product))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  function startEdit() {
    setForm({
      name: p.name ?? '', sku: p.sku ?? '', description: p.description ?? '',
      price: String(p.price ?? ''), compare_at_price: p.compareAtPrice != null ? String(p.compareAtPrice) : '',
      product_type: p.productType ?? 'physical', status: p.status ?? 'active',
      stock_quantity: p.stockQuantity != null ? String(p.stockQuantity) : '',
      low_stock_threshold: p.lowStockThreshold != null ? String(p.lowStockThreshold) : '5',
    })
    setEditing(true)
  }

  async function save() {
    if (!form.name || form.price === '') { setError('Name and price are required'); return }
    setBusy(true)
    setError('')
    try {
      const body: any = {
        name: form.name,
        sku: form.sku || undefined,
        description: form.description || undefined,
        price: parseFloat(form.price),
        compare_at_price: form.compare_at_price ? parseFloat(form.compare_at_price) || undefined : undefined,
        product_type: form.product_type,
        status: form.status,
        stock_quantity: form.product_type === 'physical' && form.stock_quantity !== '' ? parseInt(form.stock_quantity, 10) : null,
        low_stock_threshold: form.product_type === 'physical' ? parseInt(form.low_stock_threshold || '5', 10) : null,
      }
      await api.updateProduct(id, body)  // product_type/status maybe not patchable; send anyway
      setEditing(false)
      setMsg('Product saved')
      setTimeout(() => setMsg(''), 3000)
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function archive() {
    setBusy(true)
    try {
      await api.archiveProduct(id)
      setMsg('Product archived')
      setTimeout(() => router.push('/dashboard/products'), 400)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (loading && !p) return <div className="space-y-4"><Skeleton className="h-10 w-1/3" /><Skeleton className="h-56" /></div>

  if (error || !p) {
    return (
      <div className="space-y-4">
        <button onClick={() => router.push('/dashboard/products')} className="flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-charcoal"><ArrowLeft className="h-4 w-4" /> Back to products</button>
        <EmptyState title="Product not found" description={error || 'This product does not exist.'} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {msg && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">{msg}</div>}

      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/dashboard/products')} className="rounded-xl border border-gray-200 bg-white p-2 hover:bg-gray-50" aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold">{editing ? 'Edit product' : p.name}</h1>
            <Badge>{p.status}</Badge>
          </div>
          <p className="text-sm text-gray-500">{p.sku ?? 'No SKU'} · {humanize(p.productType)}</p>
        </div>
        {!editing && p.status !== 'archived' && (
          <div className="flex gap-2">
            <button onClick={startEdit} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50">Edit</button>
            <button onClick={() => setArchiveOpen(true)} className="flex items-center gap-1.5 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
              <Trash2 className="h-4 w-4" /> Archive
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Name" required><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field></div>
            <Field label="SKU"><Input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} /></Field>
            <Field label="Type"><Select value={form.product_type} onChange={e => setForm({ ...form, product_type: e.target.value })}>{PRODUCT_TYPES.map(t => <option key={t} value={t}>{humanize(t)}</option>)}</Select></Field>
            <Field label="Price (INR)" required><Input type="number" min={0} step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></Field>
            <Field label="Compare-at price"><Input type="number" min={0} step="0.01" value={form.compare_at_price} onChange={e => setForm({ ...form, compare_at_price: e.target.value })} /></Field>
            <Field label="Status"><Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{PRODUCT_STATUSES.map(s => <option key={s} value={s}>{humanize(s)}</option>)}</Select></Field>
            {form.product_type === 'physical' && (
              <>
                <Field label="Stock quantity"><Input type="number" min={0} value={form.stock_quantity} onChange={e => setForm({ ...form, stock_quantity: e.target.value })} /></Field>
                <Field label="Low stock threshold"><Input type="number" min={0} value={form.low_stock_threshold} onChange={e => setForm({ ...form, low_stock_threshold: e.target.value })} /></Field>
              </>
            )}
            <div className="sm:col-span-2"><Field label="Description"><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field></div>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => { setEditing(false); setError('') }} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50">Cancel</button>
            <button onClick={save} disabled={busy} className="rounded-xl bg-charcoal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <h3 className="font-bold">Details</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Name</dt><dd className="font-medium">{p.name}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">SKU</dt><dd className="font-medium">{p.sku ?? '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Type</dt><dd className="font-medium">{humanize(p.productType)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Price</dt><dd className="font-extrabold">{formatMoney(p.price)}</dd></div>
              {p.compareAtPrice != null && p.compareAtPrice > p.price && (
                <div className="flex justify-between"><dt className="text-gray-500">Compare-at</dt><dd className="font-medium text-gray-400 line-through">{formatMoney(p.compareAtPrice)}</dd></div>
              )}
              <div className="flex justify-between"><dt className="text-gray-500">Status</dt><dd><Badge>{p.status}</Badge></dd></div>
            </dl>
          </Card>
          <Card>
            <h3 className="font-bold">Stock</h3>
            {p.productType === 'physical' ? (
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-gray-500">On hand</dt><dd className="font-extrabold">{p.stockQuantity ?? '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Low stock threshold</dt><dd className="font-medium">{p.lowStockThreshold ?? '—'}</dd></div>
              </dl>
            ) : <p className="mt-3 text-sm text-gray-500">Stock is not tracked for digital or service products.</p>}
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={archive}
        title="Archive product?"
        message="Archived products are hidden from new orders but remain on existing order line items."
        confirmLabel="Archive"
        danger
        busy={busy}
      />
    </div>
  )
}