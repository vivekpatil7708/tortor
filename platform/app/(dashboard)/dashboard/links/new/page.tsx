'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

interface CustomField {
  name: string
  label: string
  type: string
  required: boolean
  options?: string[]
  _type?: string
  items?: ProductItem[]
}

interface ProductItem {
  name: string
  category: string
  description: string
  price: string
  delivery: string
  availability: string
  image?: string
}

const emptyProduct = (): ProductItem => ({
  name: '', category: '', description: '', price: '', delivery: 'delivery', availability: 'in-stock', image: '',
})

export default function NewLinkPage() {
  const router = useRouter()
  const [merchant, setMerchant] = useState<Record<string, unknown> | null>(null)
  const [upis, setUpis] = useState<Record<string, unknown>[]>([])
  const [form, setForm] = useState({
    title: '', description: '', upi_id: '', amount: '', amount_flexible: false,
    min_amount: '', max_amount: '', button_text: '',
    redirect_url: '', webhook_url: '',
  })
  const [fields, setFields] = useState<CustomField[]>([])
  const [products, setProducts] = useState<ProductItem[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.me().then(({ merchant: m }) => setMerchant(m)).catch(() => {})
    api.getUpis().then(upiList => {
      setUpis(upiList)
      const primary = upiList.find(u => u.is_primary) || upiList[0]
      if (primary) setForm(f => ({ ...f, upi_id: primary.vpa as string }))
    }).catch(() => {})

    const stored = sessionStorage.getItem('toropay_template')
    if (stored) {
      try {
        const t = JSON.parse(stored)
        setForm(f => ({
          ...f,
          title: t.title || f.title,
          description: t.description || f.description,
          amount: t.amount ? String(t.amount) : f.amount,
          amount_flexible: Boolean(t.amount_flexible),
          min_amount: t.min_amount ? String(t.min_amount) : f.min_amount,
          max_amount: t.max_amount ? String(t.max_amount) : f.max_amount,
          button_text: t.button_text || f.button_text,
          webhook_url: t.webhook_url || f.webhook_url,
        }))
        if (t.custom_fields) {
          const cf: CustomField[] = t.custom_fields
          setFields(cf.filter((f: CustomField) => f._type !== 'products'))
          const prodEntry = cf.find((f: CustomField) => f._type === 'products')
          if (prodEntry?.items) setProducts(prodEntry.items)
        }
        sessionStorage.removeItem('toropay_template')
      } catch { /* ignore */ }
    }
  }, [])

  function addField() {
    setFields([...fields, { name: '', label: '', type: 'text', required: false, options: [] }])
  }

  function updateField(i: number, key: string, val: unknown) {
    const updated = [...fields]
    ;(updated[i] as any)[key] = val
    setFields(updated)
  }

  function addProduct() {
    setProducts([...products, emptyProduct()])
  }

  function updateProduct(i: number, key: string, val: string) {
    const updated = [...products]
    ;(updated[i] as any)[key] = val
    setProducts(updated)
  }

  function removeProduct(i: number) {
    setProducts(products.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const customFields: CustomField[] = [...fields]
      if (products.length > 0) {
        customFields.push({ _type: 'products', name: '', label: '', type: '', required: false, items: products })
      }
      await api.createLink({
        upi_id: form.upi_id,
        title: form.title,
        description: form.description || null,
        amount: form.amount ? Number(form.amount) : null,
        amount_flexible: form.amount_flexible,
        min_amount: form.min_amount ? Number(form.min_amount) : null,
        max_amount: form.max_amount ? Number(form.max_amount) : null,
        button_text: form.button_text || null,
        custom_fields: customFields.filter(f => f._type === 'products' || (f.name && f.label)),
        redirect_url: form.redirect_url || null,
        webhook_url: form.webhook_url || null,
      })
      router.push('/dashboard/links')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create link')
    } finally {
      setSaving(false)
    }
  }

  const primaryColor = (merchant?.brand_color_primary as string) || '#7bb86c'
  const secondaryColor = (merchant?.brand_color_secondary as string) || '#2c2c2c'
  const btnRadius = merchant?.button_style === 'pill' ? 'rounded-full' : merchant?.button_style === 'square' ? 'rounded-lg' : 'rounded-xl'
  const buttonText = form.button_text || 'Continue to Pay'
  const amt = form.amount ? Number(form.amount) : 0

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Create Payment Link</h1>
        <p className="text-sm text-gray-500">Configure your payment link below.</p>
      </div>

      <div className="mb-6 rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Checkout Preview</p>
        <div className="rounded-xl border bg-white/80 p-6 text-center shadow-sm">
          {(merchant?.business_logo_url as string) && (
            <img src={merchant?.business_logo_url as string} className="mx-auto mb-3 h-10 object-contain" alt="" />
          )}
          <p className="text-lg font-bold" style={{ color: secondaryColor }}>{form.title || 'Your Payment Page'}</p>
          {form.description && <p className="mt-1 text-xs text-gray-400">{form.description}</p>}
          {products.length > 0 && (
            <div className="my-3 space-y-1 text-left">
              {products.map((p, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2 text-xs">
                  {p.image && <img src={p.image} className="h-8 w-8 rounded object-cover" alt="" />}
                  <div>
                    <p className="font-semibold">{p.name || 'Product'}</p>
                    {p.price && <p className="text-gray-500">₹{p.price}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="my-4 text-4xl font-extrabold tracking-tight" style={{ color: secondaryColor }}>
            {form.amount_flexible ? '₹___' : amt > 0 ? `₹${amt}` : '₹___'}
          </div>
          <button type="button" className={`w-full py-3 text-base font-bold text-white ${btnRadius}`}
            style={{ backgroundColor: primaryColor }}>
            {buttonText}
          </button>
          <p className="mt-3 text-xs text-gray-400">Powered by ToroPay</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
          <h2 className="mb-4 font-bold">Basic Details</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Title *</label>
              <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Description</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">UPI ID *</label>
              <select required value={form.upi_id} onChange={e => setForm({ ...form, upi_id: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary-500">
                <option value="">Select UPI ID</option>
                {upis.map(u => <option key={u.id as string} value={u.vpa as string}>{u.vpa as string}</option>)}
              </select>
              {upis.length === 0 && <p className="mt-1 text-xs text-amber-600">No UPI IDs added yet. <a href="/dashboard/upi" className="underline">Add one</a>.</p>}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
          <h2 className="mb-4 font-bold">Amount</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input type="checkbox" id="flexible" checked={form.amount_flexible} onChange={e => setForm({ ...form, amount_flexible: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300" />
              <label htmlFor="flexible" className="text-sm font-medium">Flexible amount (customer enters amount)</label>
            </div>
            {!form.amount_flexible ? (
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500">Amount (₹)</label>
                <input type="number" required={!form.amount_flexible} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary-500" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">Min amount (₹)</label>
                  <input type="number" value={form.min_amount} onChange={e => setForm({ ...form, min_amount: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">Max amount (₹)</label>
                  <input type="number" value={form.max_amount} onChange={e => setForm({ ...form, max_amount: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary-500" />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
          <h2 className="mb-4 font-bold">Button Customization</h2>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Button Text</label>
            <input value={form.button_text} onChange={e => setForm({ ...form, button_text: e.target.value })}
              placeholder="e.g. Pay Now, Book, Donate, Subscribe"
              className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary-500" />
            <p className="mt-1 text-xs text-gray-400">Shown on the checkout page. Default: Continue to Pay</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">Custom Fields</h2>
            <button type="button" onClick={addField} className="text-sm font-semibold text-primary-600 hover:underline">+ Add field</button>
          </div>
          <div className="space-y-3">
            {fields.map((f, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl border border-gray-100 bg-white/50 p-4">
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <input placeholder="Field name" value={f.name} onChange={e => updateField(i, 'name', e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-xs outline-none" />
                    <select value={f.type} onChange={e => updateField(i, 'type', e.target.value)}
                      className="rounded-lg border border-gray-200 bg-white/70 px-2 py-2 text-xs outline-none">
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="email">Email</option>
                      <option value="multiselect">Multi-select</option>
                    </select>
                  </div>
                  <input placeholder="Label" value={f.label} onChange={e => updateField(i, 'label', e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-xs outline-none" />
                  {f.type === 'multiselect' && (
                    <input placeholder="Options (comma-separated)" value={(f.options || []).join(', ')}
                      onChange={e => updateField(i, 'options', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                      className="w-full rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-xs outline-none" />
                  )}
                </div>
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={f.required} onChange={e => updateField(i, 'required', e.target.checked)}
                    className="h-3 w-3" />
                  Req
                </label>
                <button type="button" onClick={() => setFields(fields.filter((_, idx) => idx !== i))} className="text-xs text-red-500">Remove</button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">Products / Services</h2>
            <button type="button" onClick={addProduct} className="text-sm font-semibold text-primary-600 hover:underline">+ Add More</button>
          </div>
          {products.length === 0 ? (
            <p className="text-xs text-gray-400">No products added. Click &quot;+ Add More&quot; to list what you offer.</p>
          ) : (
            <div className="space-y-3">
              {products.map((p, i) => (
                <div key={i} className="rounded-xl border border-gray-100 bg-white/50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">Item {i + 1}</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => removeProduct(i)} className="text-xs text-red-500">Remove</button>
                    </div>
                  </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs text-gray-400">Name *</label>
                        <input required value={p.name} onChange={e => updateProduct(i, 'name', e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-xs outline-none" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-400">Category</label>
                        <input value={p.category} onChange={e => updateProduct(i, 'category', e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-xs outline-none" />
                      </div>
                      <div className="col-span-2">
                        <label className="mb-1 block text-xs text-gray-400">Description</label>
                        <textarea value={p.description} onChange={e => updateProduct(i, 'description', e.target.value)} rows={2}
                          className="w-full rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-xs outline-none" />
                      </div>
                      <div className="col-span-2">
                        <label className="mb-1 block text-xs text-gray-400">Image</label>
                        <input type="file" accept="image/*" onChange={e => {
                          const file = e.target.files?.[0]
                          if (file) {
                            const reader = new FileReader()
                            reader.onload = () => updateProduct(i, 'image', reader.result as string)
                            reader.readAsDataURL(file)
                          }
                        }}
                          className="w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-gray-100 file:px-2 file:py-1 file:text-xs file:font-medium hover:file:bg-gray-200" />
                        {p.image && (
                          <div className="mt-1 flex items-center gap-2">
                            <img src={p.image} className="h-10 w-10 rounded object-cover" alt="" />
                            <button type="button" onClick={() => updateProduct(i, 'image', '')} className="text-xs text-red-500">Remove</button>
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-400">Price (₹)</label>
                        <input type="number" value={p.price} onChange={e => updateProduct(i, 'price', e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-xs outline-none" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-400">Delivery Type</label>
                        <select value={p.delivery} onChange={e => updateProduct(i, 'delivery', e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-xs outline-none">
                          <option value="delivery">Delivery</option>
                          <option value="pickup">Pickup</option>
                          <option value="both">Both</option>
                          <option value="digital">Digital</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-400">Availability</label>
                        <select value={p.availability} onChange={e => updateProduct(i, 'availability', e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-xs outline-none">
                          <option value="in-stock">In Stock</option>
                          <option value="out-of-stock">Out of Stock</option>
                          <option value="pre-order">Pre-order</option>
                        </select>
                      </div>
                    </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
          <h2 className="mb-4 font-bold">Advanced</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Redirect URL (after payment)</label>
              <input value={form.redirect_url} onChange={e => setForm({ ...form, redirect_url: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Webhook URL</label>
              <input value={form.webhook_url} onChange={e => setForm({ ...form, webhook_url: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary-500" />
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" disabled={saving} size="lg">{saving ? 'Creating...' : 'Create Payment Link'}</Button>
          <Button type="button" variant="secondary" size="lg" onClick={() => router.push('/dashboard/links')}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}
