'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { humanize, PRODUCT_TYPES } from '@/lib/ui-format'
import { ArrowLeft } from 'lucide-react'

export default function NewProductPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    name: '', sku: '', description: '', price: '', compare_at_price: '',
    product_type: 'physical', status: 'active', stock_quantity: '', low_stock_threshold: '5',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setError('')
    if (!form.name || form.price === '') { setError('Name and price are required.'); return }
    setBusy(true)
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
      const res = await api.createProduct(body)
      router.push(`/dashboard/products/${res.product.id}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/dashboard/products')} className="rounded-xl border border-gray-200 bg-white p-2 hover:bg-gray-50" aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold">Add product</h1>
          <p className="text-sm text-gray-500">Create a product to attach to orders.</p>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Name" required><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Organic Cotton T-Shirt" /></Field></div>
          <Field label="SKU"><Input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} placeholder="TSH-001" /></Field>
          <Field label="Type"><Select value={form.product_type} onChange={e => setForm({ ...form, product_type: e.target.value })}>{PRODUCT_TYPES.map(t => <option key={t} value={t}>{humanize(t)}</option>)}</Select></Field>
          <Field label="Price (INR)" required><Input type="number" min={0} step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></Field>
          <Field label="Compare-at price"><Input type="number" min={0} step="0.01" value={form.compare_at_price} onChange={e => setForm({ ...form, compare_at_price: e.target.value })} /></Field>
          {form.product_type === 'physical' && (
            <>
              <Field label="Stock quantity"><Input type="number" min={0} value={form.stock_quantity} onChange={e => setForm({ ...form, stock_quantity: e.target.value })} /></Field>
              <Field label="Low stock threshold"><Input type="number" min={0} value={form.low_stock_threshold} onChange={e => setForm({ ...form, low_stock_threshold: e.target.value })} /></Field>
            </>
          )}
          <div className="sm:col-span-2"><Field label="Description"><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field></div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Link href="/dashboard/products" className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50">Cancel</Link>
          <button onClick={submit} disabled={busy} className="rounded-xl bg-charcoal px-6 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? 'Creating…' : 'Create product'}
          </button>
        </div>
      </Card>
    </div>
  )
}