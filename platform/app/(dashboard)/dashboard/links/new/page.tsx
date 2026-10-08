'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { amountRangeHint } from '@/lib/checkout-form'
import { istDayKey } from '@/lib/ist-day'
import { expiryMoment, limitsProblem, rangeProblem } from '@/lib/link-limits'
import { LoadError } from '@/components/ui/load-error'
import { Button } from '@/components/ui/button'
import { Zap, ShoppingBag, ChevronDown, ArrowRight } from 'lucide-react'

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
  'w-full rounded-xl border border-gray-300 bg-white px-4 py-3.5 text-base text-charcoal outline-none transition-all placeholder:text-gray-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10'

export default function NewLinkPage() {
  const router = useRouter()
  const [merchant, setMerchant] = useState<Record<string, unknown> | null>(null)
  const [upis, setUpis] = useState<Record<string, unknown>[]>([])
  const [upisLoaded, setUpisLoaded] = useState(false)
  const [upisFailed, setUpisFailed] = useState(false)
  const [mode, setMode] = useState<'quick' | 'sell'>('quick')

  const [form, setForm] = useState({
    title: '', description: '', upi_id: '', amount: '', amount_flexible: false,
    min_amount: '', max_amount: '', button_text: '',
    redirect_url: '', webhook_url: '',
  })
  const [sell, setSell] = useState({ unit_price: '', quantity: '1', customer_updates_qty: false })
  // Optional: stop after this many paid payments, and/or at the end of a day.
  const [limits, setLimits] = useState({ max_uses: '', expires_on: '' })
  const [fields, setFields] = useState<CustomField[]>([])
  const [products, setProducts] = useState<ProductItem[]>([])
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const [newVpa, setNewVpa] = useState('')
  const [addingUpi, setAddingUpi] = useState(false)
  const [upiAddError, setUpiAddError] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [previewQty, setPreviewQty] = useState(1)

  function loadUpis() {
    setUpisFailed(false)
    api.getUpis().then(upiList => {
      setUpis(upiList)
      setUpisLoaded(true)
      const primary = upiList.find(u => u.is_primary) || upiList[0]
      if (primary) setForm(f => ({ ...f, upi_id: primary.vpa as string }))
    }).catch(() => setUpisFailed(true))
  }

  useEffect(() => {
    api.me().then(({ merchant: m }) => setMerchant(m)).catch(() => {})
    loadUpis()

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

  /** Adds a UPI ID without leaving the form, and picks it for this link. */
  async function addUpiHere() {
    if (addingUpi || !newVpa.trim()) return
    setAddingUpi(true)
    setUpiAddError('')
    try {
      const { upi } = await api.addUpi(newVpa.trim())
      setUpis(prev => [...prev, upi])
      setForm(f => ({ ...f, upi_id: upi.vpa as string }))
      setNewVpa('')
    } catch (err: unknown) {
      setUpiAddError(err instanceof Error ? err.message : 'Could not add this UPI ID')
    } finally {
      setAddingUpi(false)
    }
  }

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
  const customerAmount = mode === 'quick' && form.amount_flexible

  function titleError() {
    if (!touched.title && form.title) return ''
    return form.title.trim() ? '' : 'Enter a short title for this payment link'
  }
  function upiError() {
    if (!touched.upi_id && form.upi_id) return ''
    return form.upi_id ? '' : 'Select the UPI ID you want to receive money on'
  }
  function amountError() {
    if (mode !== 'quick' || form.amount_flexible) return ''
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
  const rangeError = customerAmount ? rangeProblem(form.min_amount, form.max_amount) : ''
  const limitsError = limitsProblem(limits.max_uses, limits.expires_on)

  // Why "Create" can't be pressed yet, shown next to it on every screen size (U23).
  const missing =
    !form.title.trim() ? 'Add a title to continue'
    : !form.upi_id ? (upis.length ? 'Choose a UPI ID to continue' : 'Add a UPI ID to continue')
    : mode === 'quick'
      ? (!form.amount_flexible && !(Number(form.amount) > 0) ? 'Add the amount to continue' : rangeError)
      : unitPrice <= 0 ? 'Add the unit price to continue'
      : Number(sell.quantity) < 1 ? 'Add a quantity to continue'
      : ''
  const blocker = missing || limitsError
  const canSubmit = !blocker

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = { title: titleError(), upi: upiError(), amount: amountError(), unit: unitPriceError(), qty: quantityError() }
    if (Object.values(errs).some(Boolean) || blocker) {
      setTouched({ title: true, upi_id: true, amount: true, unit_price: true, quantity: true })
      if (limitsError) setAdvancedOpen(true)
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
        amount: mode === 'quick'
          ? (!form.amount_flexible && form.amount ? Number(form.amount) : null)
          : (sell.customer_updates_qty ? null : sellTotal),
        amount_flexible: customerAmount,
        min_amount: customerAmount && form.min_amount ? Number(form.min_amount) : null,
        max_amount: customerAmount && form.max_amount ? Number(form.max_amount) : null,
        button_text: form.button_text || null,
        custom_fields: customFields.filter(f => f._type === 'products' || (f.name && f.label)),
        redirect_url: form.redirect_url || null,
        webhook_url: form.webhook_url || null,
        max_uses: limits.max_uses.trim() ? Number(limits.max_uses) : null,
        expiry_at: expiryMoment(limits.expires_on),
      }
      const { link } = await api.createLink(payload)
      // Straight to the new link, ready to share.
      router.push(`/dashboard/links/${link.id as string}?created=1`)
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
    if (form.amount_flexible) {
      const range = rangeError ? '' : amountRangeHint(Number(form.min_amount) || null, Number(form.max_amount) || null)
      return { main: '₹___', sub: range ? `Customer enters the amount · ${range}` : 'Customer enters the amount' }
    }
    const amt = Number(form.amount) || 0
    return { main: amt > 0 ? `₹${amt.toLocaleString('en-IN')}` : '₹___', sub: amt > 0 ? '' : 'Enter an amount' }
  }

  const preview = previewAmount()
  const showPreviewQty = mode === 'sell' && sell.customer_updates_qty
  const effectiveQty = Math.min(Math.max(1, previewQty), Math.max(1, quantity))
  const createLabel = saving ? 'Creating...' : (mode === 'sell' ? 'Create & Share Link' : 'Create Payment Link')
  const choiceClass = (on: boolean) =>
    `rounded-lg px-3 py-2 text-sm font-semibold transition-all ${on ? 'bg-charcoal text-white shadow-sm' : 'text-gray-600 hover:text-charcoal'}`

  return (
    <div className="mx-auto max-w-xl pb-28 md:pb-0 lg:max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Create Payment Link</h1>
        <p className="text-sm text-gray-500">Done in under a minute. Pick a mode and fill the basics.</p>
      </div>

      {/* The form, with its live preview beside it on wide screens and below it on phones (U23). */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
      <form onSubmit={handleSubmit}>
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-white/80 bg-white/60 p-1.5 backdrop-blur-sm">
          <button type="button" onClick={() => setMode('quick')} aria-pressed={mode === 'quick'}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${mode === 'quick' ? 'bg-charcoal text-white shadow-md' : 'text-gray-500 hover:text-charcoal'}`}>
            <Zap className="h-4 w-4" /> Quick Link
          </button>
          <button type="button" onClick={() => setMode('sell')} aria-pressed={mode === 'sell'}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${mode === 'sell' ? 'bg-charcoal text-white shadow-md' : 'text-gray-500 hover:text-charcoal'}`}>
            <ShoppingBag className="h-4 w-4" /> Sell Items
          </button>
        </div>

        <div className="space-y-5 rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
          <div>
            <label htmlFor="link-title" className="mb-1.5 block text-sm font-semibold text-gray-700">Title <span className="text-red-400">*</span></label>
            <input id="link-title" value={form.title} onChange={e => { setForm({ ...form, title: e.target.value }); setTouched({ ...touched, title: true }) }}
              placeholder={mode === 'sell' ? 'e.g. Premium Tiffin Pack' : 'e.g. Website Design Fee'}
              className={inputClass} />
            {touched.title && titleError() && <p className="mt-1.5 text-xs text-red-600">{titleError()}</p>}
            {!touched.title && <p className="mt-1.5 text-xs text-gray-500">Shown to your customer at checkout.</p>}
          </div>

          <div>
            <label htmlFor="link-upi" className="mb-1.5 block text-sm font-semibold text-gray-700">UPI ID <span className="text-red-400">*</span></label>
            {upis.length > 0 && (
              <select id="link-upi" value={form.upi_id} onChange={e => { setForm({ ...form, upi_id: e.target.value }); setTouched({ ...touched, upi_id: true }) }}
                className={`${inputClass} ${!form.upi_id ? 'text-gray-400' : ''}`}>
                <option value="">Select UPI ID</option>
                {upis.map(u => <option key={u.id as string} value={u.vpa as string}>{u.vpa as string}</option>)}
              </select>
            )}
            {upisFailed && <LoadError what="your UPI IDs" onRetry={loadUpis} className="mt-2" />}
            {upisLoaded && upis.length === 0 && (
              // No UPI ID yet: add one here instead of leaving the form.
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                <p className="text-sm text-amber-900">Add the UPI ID you want customers to pay into.</p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input id="link-upi" value={newVpa} onChange={e => setNewVpa(e.target.value)} placeholder="yourname@okaxis"
                    autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addUpiHere() } }}
                    className={inputClass} />
                  <Button type="button" onClick={addUpiHere} disabled={addingUpi || !newVpa.trim()}>{addingUpi ? 'Adding…' : 'Add UPI ID'}</Button>
                </div>
                {upiAddError && <p className="mt-1.5 text-xs text-red-600">{upiAddError}</p>}
              </div>
            )}
            {touched.upi_id && upiError() && <p className="mt-1.5 text-xs text-red-600">{upiError()}</p>}
            {!touched.upi_id && upis.length > 0 && <p className="mt-1.5 text-xs text-gray-500">Money comes directly to this UPI ID.</p>}
          </div>

          {mode === 'quick' ? (
            <>
              <fieldset>
                <legend className="mb-1.5 block text-sm font-semibold text-gray-700">Amount <span className="text-red-400">*</span></legend>
                <div className="mb-3 inline-flex gap-1 rounded-xl border border-gray-200 bg-white p-1">
                  <button type="button" aria-pressed={!form.amount_flexible} onClick={() => setForm({ ...form, amount_flexible: false })}
                    className={choiceClass(!form.amount_flexible)}>Fixed amount</button>
                  <button type="button" aria-pressed={form.amount_flexible} onClick={() => setForm({ ...form, amount_flexible: true })}
                    className={choiceClass(form.amount_flexible)}>Customer enters amount</button>
                </div>
                {form.amount_flexible ? (
                  <div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="link-min" className="mb-1 block text-xs font-semibold text-gray-600">Minimum (₹, optional)</label>
                        <input id="link-min" type="number" min="1" inputMode="decimal" value={form.min_amount}
                          onChange={e => setForm({ ...form, min_amount: e.target.value })} placeholder="10" className={inputClass} />
                      </div>
                      <div>
                        <label htmlFor="link-max" className="mb-1 block text-xs font-semibold text-gray-600">Maximum (₹, optional)</label>
                        <input id="link-max" type="number" min="1" inputMode="decimal" value={form.max_amount}
                          onChange={e => setForm({ ...form, max_amount: e.target.value })} placeholder="5000" className={inputClass} />
                      </div>
                    </div>
                    {rangeError
                      ? <p className="mt-1.5 text-xs text-red-600">{rangeError}</p>
                      : <p className="mt-1.5 text-xs text-gray-500">Good for donations, advances and custom orders. The customer types the amount.</p>}
                  </div>
                ) : (
                  <div>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold text-gray-400">₹</span>
                      <input id="link-amount" aria-label="Amount in rupees" type="number" min="1" inputMode="decimal" value={form.amount}
                        onChange={e => { setForm({ ...form, amount: e.target.value }); setTouched({ ...touched, amount: true }) }}
                        placeholder="500"
                        className={`${inputClass} pl-9`} />
                    </div>
                    {touched.amount && amountError() && <p className="mt-1.5 text-xs text-red-600">{amountError()}</p>}
                    {!touched.amount && <p className="mt-1.5 text-xs text-gray-500">Fixed amount your customer pays.</p>}
                  </div>
                )}
              </fieldset>

              <div>
                <label htmlFor="link-button" className="mb-1.5 block text-sm font-semibold text-gray-700">Button Text</label>
                <input id="link-button" value={form.button_text} onChange={e => setForm({ ...form, button_text: e.target.value })}
                  placeholder="e.g. Pay Now, Book, Donate"
                  className={inputClass} />
                <p className="mt-1.5 text-xs text-gray-500">Shown on the pay button. Default: &quot;Continue to Pay&quot;.</p>
              </div>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="link-unit-price" className="mb-1.5 block text-sm font-semibold text-gray-700">Unit Price (₹) <span className="text-red-400">*</span></label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold text-gray-400">₹</span>
                  <input id="link-unit-price" type="number" min="1" inputMode="decimal" value={sell.unit_price}
                    onChange={e => { setSell({ ...sell, unit_price: e.target.value }); setTouched({ ...touched, unit_price: true }) }}
                    placeholder="250"
                    className={`${inputClass} pl-9`} />
                </div>
                {touched.unit_price && unitPriceError() && <p className="mt-1.5 text-xs text-red-600">{unitPriceError()}</p>}
                {!touched.unit_price && <p className="mt-1.5 text-xs text-gray-500">Price for a single item.</p>}
              </div>

              <div>
                <label htmlFor="link-quantity" className="mb-1.5 block text-sm font-semibold text-gray-700">{sell.customer_updates_qty ? 'Max Quantity' : 'Quantity'} <span className="text-red-400">*</span></label>
                <input id="link-quantity" type="number" min="1" inputMode="numeric" value={sell.quantity}
                  onChange={e => { setSell({ ...sell, quantity: e.target.value }); setTouched({ ...touched, quantity: true }) }}
                  className={inputClass} />
                {touched.quantity && quantityError() && <p className="mt-1.5 text-xs text-red-600">{quantityError()}</p>}
                {!touched.quantity && <p className="mt-1.5 text-xs text-gray-500">{sell.customer_updates_qty ? `The most a customer can buy. Total is price × quantity, updated live.` : 'How many items this link sells.'}</p>}
              </div>

              <div className="rounded-xl border border-primary-500/20 bg-primary-50/60 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">{sell.customer_updates_qty ? 'Max total' : 'Total'}</span>
                  <span className="text-xl font-extrabold tracking-tight" style={{ color: secondaryColor }}>
                    {unitPrice > 0 ? `₹${sellTotal.toLocaleString('en-IN')}` : '₹0'}
                  </span>
                </div>
                {unitPrice > 0 && quantity >= 1 && (
                  <p className="mt-0.5 text-xs text-gray-500">{quantity} × ₹{unitPrice.toLocaleString('en-IN')} = ₹{sellTotal.toLocaleString('en-IN')}</p>
                )}
              </div>

              <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white/70 p-4">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Customer can update quantity</p>
                  <p className="mt-0.5 text-xs text-gray-500">Fixed unit price. Let buyers choose how many items to pay for at checkout (up to {quantity >= 1 ? quantity : '—'}).</p>
                </div>
                <button type="button" role="switch" aria-checked={sell.customer_updates_qty} aria-label="Customer can update quantity"
                  onClick={() => setSell({ ...sell, customer_updates_qty: !sell.customer_updates_qty })}
                  className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${sell.customer_updates_qty ? 'bg-primary-500' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${sell.customer_updates_qty ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
            </>
          )}

          <button type="button" onClick={() => setAdvancedOpen(!advancedOpen)} aria-expanded={advancedOpen}
            className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-white">
            <span>Advanced options</span>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
          </button>

          {advancedOpen && (
            <div className="space-y-5 border-t border-gray-100 pt-5">
              <div>
                <label htmlFor="link-description" className="mb-1.5 block text-sm font-semibold text-gray-700">Description</label>
                <textarea id="link-description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
                  placeholder="Optional short note about this payment."
                  className={`${inputClass} resize-none`} />
              </div>

              <fieldset>
                <legend className="mb-1.5 block text-sm font-semibold text-gray-700">Limits</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="link-max-uses" className="mb-1 block text-xs font-semibold text-gray-600">Stop after (paid payments)</label>
                    <input id="link-max-uses" type="number" min="1" step="1" inputMode="numeric" value={limits.max_uses}
                      onChange={e => setLimits({ ...limits, max_uses: e.target.value })} placeholder="No limit" className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="link-expires" className="mb-1 block text-xs font-semibold text-gray-600">Expires on</label>
                    <input id="link-expires" type="date" min={istDayKey(new Date())} value={limits.expires_on}
                      onChange={e => setLimits({ ...limits, expires_on: e.target.value })} className={inputClass} />
                  </div>
                </div>
                {limitsError
                  ? <p className="mt-1.5 text-xs text-red-600">{limitsError}</p>
                  : <p className="mt-1.5 text-xs text-gray-500">Optional. The link stops taking payments after this many paid payments, or once that day ends.</p>}
              </fieldset>

              <div>
                <label htmlFor="link-redirect" className="mb-1.5 block text-sm font-semibold text-gray-700">Redirect URL</label>
                <input id="link-redirect" value={form.redirect_url} onChange={e => setForm({ ...form, redirect_url: e.target.value })}
                  placeholder="https://yourapp.com/thank-you"
                  className={inputClass} />
                <p className="mt-1.5 text-xs text-gray-500">Send the customer here after a successful payment.</p>
              </div>

              <div>
                <label htmlFor="link-webhook" className="mb-1.5 block text-sm font-semibold text-gray-700">Webhook URL</label>
                <input id="link-webhook" value={form.webhook_url} onChange={e => setForm({ ...form, webhook_url: e.target.value })}
                  placeholder="https://yourapp.com/webhook/toropay"
                  className={inputClass} />
                <p className="mt-1.5 text-xs text-gray-500">Receive payment events on your server.</p>
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
                          <input placeholder="Field name" aria-label="Field name" value={f.name} onChange={e => updateField(i, 'name', e.target.value)}
                            className="w-full rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-sm outline-none" />
                          <input placeholder="Label" aria-label="Field label" value={f.label} onChange={e => updateField(i, 'label', e.target.value)}
                            className="w-full rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-sm outline-none" />
                          <div className="flex gap-2">
                            <select value={f.type} aria-label="Field type" onChange={e => updateField(i, 'type', e.target.value)}
                              className="rounded-lg border border-gray-200 bg-white/80 px-2 py-2.5 text-sm outline-none">
                              <option value="text">Text</option>
                              <option value="number">Number</option>
                              <option value="email">Email</option>
                              <option value="multiselect">Multi-select</option>
                            </select>
                            {f.type === 'multiselect' && (
                              <input placeholder="Options (comma-separated)" aria-label="Options" value={(f.options || []).join(', ')}
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
                  {fields.length === 0 && <p className="text-xs text-gray-500">Collect extra info like email or booking date.</p>}
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700">Products / Services</p>
                  <button type="button" onClick={addProduct} className="text-sm font-semibold text-primary-600 hover:underline">+ Add item</button>
                </div>
                {products.length === 0 ? (
                  <p className="text-xs text-gray-500">Add products to build a multi-item order form (used with the Sell Items mode).</p>
                ) : (
                  <div className="space-y-3">
                    {products.map((p, i) => (
                      <div key={i} className="rounded-xl border border-gray-100 bg-white/60 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-500">Item {i + 1}</span>
                          <button type="button" onClick={() => removeProduct(i)} className="text-xs font-medium text-red-500">Remove</button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <input placeholder="Name *" aria-label="Item name" required value={p.name} onChange={e => updateProduct(i, 'name', e.target.value)}
                            className="col-span-2 rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-sm outline-none" />
                          <input placeholder="Category" aria-label="Item category" value={p.category} onChange={e => updateProduct(i, 'category', e.target.value)}
                            className="rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-sm outline-none" />
                          <input type="number" placeholder="Price (₹)" aria-label="Item price in rupees" value={p.price} onChange={e => updateProduct(i, 'price', e.target.value)}
                            className="rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-sm outline-none" />
                          <input type="number" min="1" placeholder="Max qty (optional)" aria-label="Most a customer can buy" value={p.quantity || ''} onChange={e => updateProduct(i, 'quantity', e.target.value)}
                            className="rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-sm outline-none" />
                          <textarea placeholder="Description" aria-label="Item description" value={p.description} onChange={e => updateProduct(i, 'description', e.target.value)} rows={2}
                            className="col-span-2 rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-sm outline-none resize-none" />
                          <select value={p.delivery} aria-label="Delivery" onChange={e => updateProduct(i, 'delivery', e.target.value)}
                            className="rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-sm outline-none">
                            <option value="delivery">Delivery</option>
                            <option value="pickup">Pickup</option>
                            <option value="both">Both</option>
                            <option value="digital">Digital</option>
                          </select>
                          <select value={p.availability} aria-label="Availability" onChange={e => updateProduct(i, 'availability', e.target.value)}
                            className="rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-sm outline-none">
                            <option value="in-stock">In Stock</option>
                            <option value="out-of-stock">Out of Stock</option>
                            <option value="pre-order">Pre-order</option>
                          </select>
                          <label className="col-span-2 flex items-center gap-3 rounded-lg border border-dashed border-gray-200 px-3 py-2.5 text-sm text-gray-500">
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

          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

          <div className="hidden pt-2 md:block">
            <div className="flex gap-3">
              <Button type="submit" disabled={saving || !canSubmit} size="lg" className="flex-1">{createLabel}</Button>
              <Button type="button" variant="secondary" size="lg" onClick={() => router.push('/dashboard/links')}>Cancel</Button>
            </div>
            {blocker && <p className="mt-2 text-xs text-gray-500">{blocker}</p>}
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/80 bg-white/90 p-4 backdrop-blur-lg md:hidden">
          <button type="submit" disabled={saving || !canSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-4 text-base font-bold text-white shadow-lg disabled:opacity-50"
            style={{ backgroundColor: canSubmit ? primaryColor : '#d1d5db' }}>
            {createLabel}
            {!saving && <ArrowRight className="h-4 w-4" />}
          </button>
          {blocker && <p className="mt-2 text-center text-xs text-gray-500">{blocker}</p>}
        </div>
      </form>

      <aside aria-label="Live preview" className="mt-6 rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm lg:sticky lg:top-8 lg:mt-0">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Live Preview</p>
          <span className="flex items-center gap-1 text-xs font-semibold text-green-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />Updates live</span>
        </div>
        <div className="rounded-xl border bg-white/80 p-6 text-center shadow-sm">
          {(merchant?.business_logo_url as string) && (
            <img src={merchant?.business_logo_url as string} className="mx-auto mb-3 h-10 object-contain" alt="" />
          )}
          {(merchant?.business_name as string) && <p className="mb-1 text-xs font-semibold text-gray-500">{merchant?.business_name as string}</p>}
          <p className="text-lg font-bold" style={{ color: secondaryColor }}>{form.title || 'Your Payment Page'}</p>
          {form.description && <p className="mt-1 text-xs text-gray-500 line-clamp-1">{form.description}</p>}
          <div className="my-4">
            <div className="text-4xl font-extrabold tracking-tight" style={{ color: secondaryColor }}>{preview.main}</div>
            {preview.sub && <p className="mt-1 text-xs text-gray-500">{preview.sub}</p>}
          </div>
          {showPreviewQty && unitPrice > 0 && (
            <div className="mx-auto mb-3 flex w-fit items-center gap-3 rounded-full border border-gray-200 bg-gray-50 px-2 py-1">
              <button type="button" aria-label="One less" onClick={() => setPreviewQty(prev => Math.max(1, prev - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-base font-bold text-charcoal shadow-sm">−</button>
              <span className="min-w-6 text-center text-sm font-bold">{effectiveQty}</span>
              <button type="button" aria-label="One more" onClick={() => setPreviewQty(prev => Math.min(Math.max(1, quantity), prev + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-base font-bold text-charcoal shadow-sm">+</button>
            </div>
          )}
          <button type="button" tabIndex={-1} aria-hidden className={`w-full py-3 text-base font-bold text-white ${btnRadius}`} style={{ backgroundColor: primaryColor }}>
            {buttonText}
          </button>
          <p className="mt-3 text-xs text-gray-500">You pay {(merchant?.business_name as string) || 'the seller'} directly with UPI.</p>
        </div>
      </aside>
      </div>
    </div>
  )
}
