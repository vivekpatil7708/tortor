'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Zap, ShoppingBag, ChevronDown, Check, ArrowRight } from 'lucide-react'

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
  quantity?: number
}

const emptyProduct = (): ProductItem => ({
  name: '', category: '', description: '', price: '', delivery: 'delivery', availability: 'in-stock', image: '',
})

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white/80 px-4 py-3.5 text-base text-charcoal outline-none transition-all placeholder:text-gray-300 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10'

export default function NewLinkPage() {
  const router = useRouter()
  const [merchant, setMerchant] = useState<Record<string, unknown> | null>(null)
  const [upis, setUpis] = useState<Record<string, unknown>[]>([])
  const [mode, setMode] = useState<'quick' | 'sell'>('quick')

  const [form, setForm] = useState({
    title: '', description: '', upi_id: '', amount: '', amount_flexible: false,
    min_amount: '', max_amount: '', button_text: '',
    redirect_url: '', webhook_url: '',
  })
  const [sell, setSell] = useState({ unit_price: '', quantity: '1', customer_updates_qty: false })
  const [fields, setFields] = useState<CustomField[]>([])
  const [products, setProducts] = useState<ProductItem[]>([])
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [previewQty, setPreviewQty] = useState(1)

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
    if (key === 'quantity') {
      ;(updated[i] as any)[key] = val ? Math.max(1, parseInt(val, 10) || 1) : undefined
    } else {
      ;(updated[i] as any)[key] = val
    }
    setProducts(updated)
  }

  function removeProduct(i: number) {
    setProducts(products.filter((_, idx) => idx !== i))
  }

  const unitPrice = Number(sell.unit_price) || 0
  const quantity = Math.max(1, Number(sell.quantity) || 1)
  const sellTotal = unitPrice * quantity

  function titleError() {
    if (!touched.title && form.title) return ''
    return form.title.trim() ? '' : 'Enter a short title for this payment link'
  }
  function upiError() {
    if (!touched.upi_id && form.upi_id) return ''
    return form.upi_id ? '' : 'Select the UPI ID you want to receive money on'
  }
  function amountError() {
    if (mode !== 'quick') return ''
    if (!touched.amount && form.amount) return ''
    const a = Number(form.amount)
    if (!form.amount) return 'Enter the amount your customer should pay'
    if (isNaN(a) || a <= 0) return 'Amount must be greater than 0'
    return ''
  }
  function unitPriceError() {
    if (mode !== 'sell') return ''
    if (!touched.unit_price && sell.unit_price) return ''
    if (!sell.unit_price) return 'Enter the price for one item'
    if (unitPrice <= 0) return 'Unit price must be greater than 0'
    return ''
  }
  function quantityError() {
    if (mode !== 'sell') return ''
    if (!touched.quantity && sell.quantity) return ''
    const q = Number(sell.quantity)
    if (!sell.quantity) return 'Enter a quantity'
    if (isNaN(q) || q < 1) return 'Quantity must be at least 1'
    return ''
  }

  const canSubmit =
    (form.title.trim() ? true : false) &&
    (form.upi_id ? true : false) &&
    (mode === 'quick'
      ? (form.amount !== '' && Number(form.amount) > 0)
      : (unitPrice > 0 && Number(sell.quantity) >= 1))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = { title: titleError(), upi: upiError(), amount: amountError(), unit: unitPriceError(), qty: quantityError() }
    if (Object.values(errs).some(Boolean)) {
      setTouched({ title: true, upi_id: true, amount: true, unit_price: true, quantity: true })
      return
    }
    setSaving(true)
    setError('')
    try {
      const customFields: CustomField[] = [...fields]
      if (mode === 'sell' && sell.customer_updates_qty) {
        customFields.push({
          _type: 'products', name: '', label: '', type: '', required: false,
          items: [{
            name: form.title || 'Item',
            category: '',
            description: form.description || '',
            price: String(unitPrice),
            delivery: 'delivery',
            availability: 'in-stock',
            quantity,
          }],
        })
      } else if (products.length > 0) {
        customFields.push({ _type: 'products', name: '', label: '', type: '', required: false, items: products })
      }
      const payload: Record<string, unknown> = {
        upi_id: form.upi_id,
        title: form.title,
        description: form.description || null,
        amount: mode === 'quick' ? (form.amount ? Number(form.amount) : null) : (sell.customer_updates_qty ? null : sellTotal),
        amount_flexible: mode === 'quick' ? form.amount_flexible : false,
        min_amount: mode === 'quick' ? (form.min_amount ? Number(form.min_amount) : null) : null,
        max_amount: mode === 'quick' ? (form.max_amount ? Number(form.max_amount) : null) : null,
        button_text: form.button_text || null,
        custom_fields: customFields.filter(f => f._type === 'products' || (f.name && f.label)),
        redirect_url: form.redirect_url || null,
        webhook_url: form.webhook_url || null,
      }
      await api.createLink(payload)
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

  function previewAmount() {
    if (mode === 'sell') {
      if (!sell.unit_price) return { main: '₹___', sub: 'Enter unit price' }
      if (sell.customer_updates_qty) {
        const qty = Math.min(Math.max(1, previewQty), Math.max(1, quantity))
        const total = unitPrice * qty
        return {
          main: `₹${total.toLocaleString('en-IN')}`,
          sub: `${qty} × ₹${unitPrice.toLocaleString('en-IN')} · up to ${quantity} item${quantity > 1 ? 's' : ''}`,
        }
      }
      return {
        main: `₹${sellTotal.toLocaleString('en-IN')}`,
        sub: `${quantity} item${quantity > 1 ? 's' : ''} × ₹${unitPrice.toLocaleString('en-IN')} = ₹${sellTotal.toLocaleString('en-IN')}`,
      }
    }
    if (form.amount_flexible) return { main: '₹___', sub: 'Customer enters any amount' }
    const amt = Number(form.amount) || 0
    return { main: amt > 0 ? `₹${amt.toLocaleString('en-IN')}` : '₹___', sub: amt > 0 ? '' : 'Enter an amount' }
  }

  const preview = previewAmount()
  const showPreviewQty = mode === 'sell' && sell.customer_updates_qty
  const effectiveQty = Math.min(Math.max(1, previewQty), Math.max(1, quantity))

  return (
    <div className="mx-auto max-w-xl pb-24 md:pb-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Create Payment Link</h1>
        <p className="text-sm text-gray-500">Done in under a minute. Pick a mode and fill the basics.</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-white/80 bg-white/60 p-1.5 backdrop-blur-sm">
        <button type="button" onClick={() => setMode('quick')}
          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${mode === 'quick' ? 'bg-charcoal text-white shadow-md' : 'text-gray-500 hover:text-charcoal'}`}>
          <Zap className="h-4 w-4" /> Quick Link
        </button>
        <button type="button" onClick={() => setMode('sell')}
          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${mode === 'sell' ? 'bg-charcoal text-white shadow-md' : 'text-gray-500 hover:text-charcoal'}`}>
          <ShoppingBag className="h-4 w-4" /> Sell Items
        </button>
      </div>

      <div className="mb-6 rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Live Preview</p>
          <span className="flex items-center gap-1 text-[10px] font-semibold text-green-600"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />Updates live</span>
        </div>
        <div className="rounded-xl border bg-white/80 p-6 text-center shadow-sm">
          {(merchant?.business_logo_url as string) && (
            <img src={merchant?.business_logo_url as string} className="mx-auto mb-3 h-10 object-contain" alt="" />
          )}
          <p className="text-lg font-bold" style={{ color: secondaryColor }}>{form.title || 'Your Payment Page'}</p>
          {form.description && <p className="mt-1 text-xs text-gray-400 line-clamp-1">{form.description}</p>}
          <div className="my-4">
            <div className="text-4xl font-extrabold tracking-tight" style={{ color: secondaryColor }}>{preview.main}</div>
            {preview.sub && <p className="mt-1 text-xs text-gray-400">{preview.sub}</p>}
          </div>
          {showPreviewQty && unitPrice > 0 && (
            <div className="mx-auto mb-3 flex w-fit items-center gap-3 rounded-full border border-gray-200 bg-gray-50 px-2 py-1">
              <button type="button" onClick={() => setPreviewQty(prev => Math.max(1, prev - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-base font-bold text-charcoal shadow-sm">−</button>
              <span className="min-w-6 text-center text-sm font-bold">{effectiveQty}</span>
              <button type="button" onClick={() => setPreviewQty(prev => Math.min(Math.max(1, quantity), prev + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-base font-bold text-charcoal shadow-sm">+</button>
            </div>
          )}
          <button type="button" className={`w-full py-3 text-base font-bold text-white ${btnRadius}`} style={{ backgroundColor: primaryColor }}>
            {buttonText}
          </button>
          <p className="mt-3 text-xs text-gray-400">Powered by ToroPay</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="space-y-5 rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">Title <span className="text-red-400">*</span></label>
            <input value={form.title} onChange={e => { setForm({ ...form, title: e.target.value }); setTouched({ ...touched, title: true }) }}
              placeholder={mode === 'sell' ? 'e.g. Premium Tiffin Pack' : 'e.g. Website Design Fee'}
              className={inputClass} />
            {touched.title && titleError() && <p className="mt-1.5 text-xs text-red-500">{titleError()}</p>}
            {!touched.title && <p className="mt-1.5 text-xs text-gray-400">Shown to your customer at checkout.</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">UPI ID <span className="text-red-400">*</span></label>
            <select value={form.upi_id} onChange={e => { setForm({ ...form, upi_id: e.target.value }); setTouched({ ...touched, upi_id: true }) }}
              className={`${inputClass} ${!form.upi_id ? 'text-gray-400' : ''}`}>
              <option value="">Select UPI ID</option>
              {upis.map(u => <option key={u.id as string} value={u.vpa as string}>{u.vpa as string}</option>)}
            </select>
            {upis.length === 0 && <p className="mt-1.5 text-xs text-amber-600">No UPI IDs yet. <a href="/dashboard/upi" className="underline">Add one first</a>.</p>}
            {touched.upi_id && upiError() && <p className="mt-1.5 text-xs text-red-500">{upiError()}</p>}
            {!touched.upi_id && upis.length > 0 && <p className="mt-1.5 text-xs text-gray-400">Money comes directly to this UPI ID.</p>}
          </div>

          {mode === 'quick' ? (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">Amount (₹) <span className="text-red-400">*</span></label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold text-gray-400">₹</span>
                  <input type="number" min="1" inputMode="decimal" value={form.amount}
                    onChange={e => { setForm({ ...form, amount: e.target.value }); setTouched({ ...touched, amount: true }) }}
                    placeholder="500"
                    className={`${inputClass} pl-9`} />
                </div>
                {touched.amount && amountError() && <p className="mt-1.5 text-xs text-red-500">{amountError()}</p>}
                {!touched.amount && <p className="mt-1.5 text-xs text-gray-400">Fixed amount your customer pays.</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">Button Text</label>
                <input value={form.button_text} onChange={e => setForm({ ...form, button_text: e.target.value })}
                  placeholder="e.g. Pay Now, Book, Donate"
                  className={inputClass} />
                <p className="mt-1.5 text-xs text-gray-400">Shown on the pay button. Default: &quot;Continue to Pay&quot;.</p>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">Unit Price (₹) <span className="text-red-400">*</span></label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold text-gray-400">₹</span>
                  <input type="number" min="1" inputMode="decimal" value={sell.unit_price}
                    onChange={e => { setSell({ ...sell, unit_price: e.target.value }); setTouched({ ...touched, unit_price: true }) }}
                    placeholder="250"
                    className={`${inputClass} pl-9`} />
                </div>
                {touched.unit_price && unitPriceError() && <p className="mt-1.5 text-xs text-red-500">{unitPriceError()}</p>}
                {!touched.unit_price && <p className="mt-1.5 text-xs text-gray-400">Price for a single item.</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">{sell.customer_updates_qty ? 'Max Quantity' : 'Quantity'} <span className="text-red-400">*</span></label>
                <input type="number" min="1" inputMode="numeric" value={sell.quantity}
                  onChange={e => { setSell({ ...sell, quantity: e.target.value }); setTouched({ ...touched, quantity: true }) }}
                  className={inputClass} />
                {touched.quantity && quantityError() && <p className="mt-1.5 text-xs text-red-500">{quantityError()}</p>}
                {!touched.quantity && <p className="mt-1.5 text-xs text-gray-400">{sell.customer_updates_qty ? `The most a customer can buy. Total is price × quantity, updated live.` : 'How many items this link sells.'}</p>}
              </div>

              <div className="rounded-xl border border-primary-500/20 bg-primary-50/60 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">{sell.customer_updates_qty ? 'Max total' : 'Total'}</span>
                  <span className="text-xl font-extrabold tracking-tight" style={{ color: secondaryColor }}>
                    {unitPrice > 0 ? `₹${sellTotal.toLocaleString('en-IN')}` : '₹0'}
                  </span>
                </div>
                {unitPrice > 0 && quantity >= 1 && (
                  <p className="mt-0.5 text-xs text-gray-400">{quantity} × ₹{unitPrice.toLocaleString('en-IN')} = ₹{sellTotal.toLocaleString('en-IN')}</p>
                )}
              </div>

              <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white/70 p-4">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Customer can update quantity</p>
                  <p className="mt-0.5 text-xs text-gray-400">Fixed unit price. Let buyers choose how many items to pay for at checkout (up to {quantity >= 1 ? quantity : '—'}).</p>
                </div>
                <button type="button" role="switch" aria-checked={sell.customer_updates_qty}
                  onClick={() => setSell({ ...sell, customer_updates_qty: !sell.customer_updates_qty })}
                  className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${sell.customer_updates_qty ? 'bg-primary-500' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${sell.customer_updates_qty ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
            </>
          )}

          <button type="button" onClick={() => setAdvancedOpen(!advancedOpen)}
            className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-white">
            <span>Advanced options</span>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
          </button>

          {advancedOpen && (
            <div className="space-y-5 border-t border-gray-100 pt-5">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
                  placeholder="Optional short note about this payment."
                  className={`${inputClass} resize-none`} />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">Redirect URL</label>
                <input value={form.redirect_url} onChange={e => setForm({ ...form, redirect_url: e.target.value })}
                  placeholder="https://yourapp.com/thank-you"
                  className={inputClass} />
                <p className="mt-1.5 text-xs text-gray-400">Send the customer here after a successful payment.</p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">Webhook URL</label>
                <input value={form.webhook_url} onChange={e => setForm({ ...form, webhook_url: e.target.value })}
                  placeholder="https://yourapp.com/webhook/toropay"
                  className={inputClass} />
                <p className="mt-1.5 text-xs text-gray-400">Receive payment events on your server.</p>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700">Custom Fields</p>
                  <button type="button" onClick={addField} className="text-sm font-semibold text-primary-600 hover:underline">+ Add field</button>
                </div>
                <div className="space-y-3">
                  {fields.map((f, i) => (
                    <div key={i} className="rounded-xl border border-gray-100 bg-white/60 p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 space-y-2">
                          <input placeholder="Field name" value={f.name} onChange={e => updateField(i, 'name', e.target.value)}
                            className="w-full rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-sm outline-none" />
                          <input placeholder="Label" value={f.label} onChange={e => updateField(i, 'label', e.target.value)}
                            className="w-full rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-sm outline-none" />
                          <div className="flex gap-2">
                            <select value={f.type} onChange={e => updateField(i, 'type', e.target.value)}
                              className="rounded-lg border border-gray-200 bg-white/80 px-2 py-2.5 text-sm outline-none">
                              <option value="text">Text</option>
                              <option value="number">Number</option>
                              <option value="email">Email</option>
                              <option value="multiselect">Multi-select</option>
                            </select>
                            {f.type === 'multiselect' && (
                              <input placeholder="Options (comma-separated)" value={(f.options || []).join(', ')}
                                onChange={e => updateField(i, 'options', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                className="flex-1 rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-sm outline-none" />
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-3">
                          <label className="flex items-center gap-1.5 text-xs text-gray-500">
                            <input type="checkbox" checked={f.required} onChange={e => updateField(i, 'required', e.target.checked)} className="h-3.5 w-3.5" />
                            Required
                          </label>
                          <button type="button" onClick={() => setFields(fields.filter((_, idx) => idx !== i))} className="text-xs font-medium text-red-500">Remove</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {fields.length === 0 && <p className="text-xs text-gray-400">Collect extra info like email or booking date.</p>}
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700">Products / Services</p>
                  <button type="button" onClick={addProduct} className="text-sm font-semibold text-primary-600 hover:underline">+ Add item</button>
                </div>
                {products.length === 0 ? (
                  <p className="text-xs text-gray-400">Add products to build a multi-item order form (used with the Sell Items mode).</p>
                ) : (
                  <div className="space-y-3">
                    {products.map((p, i) => (
                      <div key={i} className="rounded-xl border border-gray-100 bg-white/60 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-500">Item {i + 1}</span>
                          <button type="button" onClick={() => removeProduct(i)} className="text-xs font-medium text-red-500">Remove</button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <input placeholder="Name *" required value={p.name} onChange={e => updateProduct(i, 'name', e.target.value)}
                            className="col-span-2 rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-sm outline-none" />
                          <input placeholder="Category" value={p.category} onChange={e => updateProduct(i, 'category', e.target.value)}
                            className="rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-sm outline-none" />
                          <input type="number" placeholder="Price (₹)" value={p.price} onChange={e => updateProduct(i, 'price', e.target.value)}
                            className="rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-sm outline-none" />
                          <input type="number" min="1" placeholder="Max qty (optional)" value={p.quantity || ''} onChange={e => updateProduct(i, 'quantity', e.target.value)}
                            className="rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-sm outline-none" />
                          <textarea placeholder="Description" value={p.description} onChange={e => updateProduct(i, 'description', e.target.value)} rows={2}
                            className="col-span-2 rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-sm outline-none resize-none" />
                          <select value={p.delivery} onChange={e => updateProduct(i, 'delivery', e.target.value)}
                            className="rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-sm outline-none">
                            <option value="delivery">Delivery</option>
                            <option value="pickup">Pickup</option>
                            <option value="both">Both</option>
                            <option value="digital">Digital</option>
                          </select>
                          <select value={p.availability} onChange={e => updateProduct(i, 'availability', e.target.value)}
                            className="rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-sm outline-none">
                            <option value="in-stock">In Stock</option>
                            <option value="out-of-stock">Out of Stock</option>
                            <option value="pre-order">Pre-order</option>
                          </select>
                          <label className="col-span-2 flex items-center gap-3 rounded-lg border border-dashed border-gray-200 px-3 py-2.5 text-sm text-gray-400">
                            <input type="file" accept="image/*" className="hidden" onChange={e => {
                              const file = e.target.files?.[0]
                              if (file) {
                                const reader = new FileReader()
                                reader.onload = () => updateProduct(i, 'image', reader.result as string)
                                reader.readAsDataURL(file)
                              }
                            }} />
                            <span className="flex items-center gap-2"><span className="h-5 w-5 rounded-full border border-gray-300 flex items-center justify-center text-xs">+</span> Add product image</span>
                            {p.image && <img src={p.image} className="ml-auto h-10 w-10 rounded object-cover" alt="" />}
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="hidden md:flex gap-3 pt-2">
            <Button type="submit" disabled={saving || !canSubmit} size="lg" className="flex-1">
              {saving ? 'Creating...' : (mode === 'sell' ? 'Create & Share Link' : 'Create Payment Link')}
            </Button>
            <Button type="button" variant="secondary" size="lg" onClick={() => router.push('/dashboard/links')}>Cancel</Button>
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/80 bg-white/90 p-4 backdrop-blur-lg md:hidden">
          <button type="submit" disabled={saving || !canSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-4 text-base font-bold text-white shadow-lg disabled:opacity-50"
            style={{ backgroundColor: canSubmit ? primaryColor : '#d1d5db' }}>
            {saving ? 'Creating...' : (mode === 'sell' ? 'Create & Share Link' : 'Create Payment Link')}
            {!saving && <ArrowRight className="h-4 w-4" />}
          </button>
          <p className="mt-2 text-center text-[11px] text-gray-400">
            {!form.title ? 'Add a title to continue' : !form.upi_id ? 'Select a UPI ID to continue' : mode === 'quick' ? (!form.amount ? 'Add the amount to continue' : '') : (unitPrice <= 0 ? 'Add unit price to continue' : Number(sell.quantity) < 1 ? 'Add quantity to continue' : '')}
          </p>
        </div>
      </form>
    </div>
  )
}
