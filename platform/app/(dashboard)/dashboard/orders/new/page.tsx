'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { formatMoney } from '@/lib/ui-format'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'

type Product = { id: string; name: string; sku: string; price: number; stockQuantity: number | null }
type Customer = { id: string; fullName: string; phone: string; email: string | null }
type LineItem = { productId: string; name: string; price: number; qty: number }

export default function NewOrderPage() {
  const router = useRouter()

  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])

  const [customerId, setCustomerId] = useState('')
  const [source, setSource] = useState('manual_order')
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [shippingAmount, setShippingAmount] = useState('0')
  const [discountAmount, setDiscountAmount] = useState('0')
  const [customerNote, setCustomerNote] = useState('')

  // new customer fields
  const [newCustomer, setNewCustomer] = useState(false)
  const [ncName, setNcName] = useState('')
  const [ncPhone, setNcPhone] = useState('')
  const [ncEmail, setNcEmail] = useState('')

  // shipping address snapshot
  const [addrName, setAddrName] = useState('')
  const [addrPhone, setAddrPhone] = useState('')
  const [addrLine1, setAddrLine1] = useState('')
  const [addrLine2, setAddrLine2] = useState('')
  const [addrCity, setAddrCity] = useState('')
  const [addrState, setAddrState] = useState('')
  const [addrPincode, setAddrPincode] = useState('')

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.getProducts('?page_size=100&status=active').then(r => setProducts(r.products as Product[])).catch(() => {})
    api.getCustomers('?page_size=100').then(r => setCustomers(r.customers as Customer[])).catch(() => {})
  }, [])

  function addLine() {
    if (lineItems.length >= products.length) return
    const p = products[lineItems.length]
    if (!p) return
    setLineItems(prev => [...prev, { productId: p.id, name: p.name, price: p.price, qty: 1 }])
  }

  function updateLine(idx: number, productId: string) {
    const p = products.find(x => x.id === productId)
    if (!p) return
    setLineItems(prev => prev.map((li, i) => (i === idx ? { productId, name: p.name, price: p.price, qty: li.qty } : li)))
  }

  function removeLine(idx: number) {
    setLineItems(prev => prev.filter((_, i) => i !== idx))
  }

  const subtotal = lineItems.reduce((s, li) => s + li.price * li.qty, 0)
  const shipping = parseFloat(shippingAmount || '0') || 0
  const discount = parseFloat(discountAmount || '0') || 0
  const total = subtotal + shipping - discount

  async function submit() {
    setError('')
    if (lineItems.length === 0) { setError('Add at least one product.'); return }
    const floatTotal = Math.round(total * 100) / 100
    if (floatTotal <= 0) { setError('Order total must be greater than zero.'); return }

    const shippingAddress = addrLine1 || addrCity
      ? {
          recipient_name: addrName || ncName,
          phone: addrPhone || ncPhone,
          line1: addrLine1,
          line2: addrLine2 || undefined,
          city: addrCity,
          state: addrState,
          pincode: addrPincode,
        }
      : undefined

    setBusy(true)
    try {
      const res = await api.createOrder({
        customer_id: newCustomer ? null : customerId || null,
        customer: newCustomer
          ? { full_name: ncName, phone: ncPhone, email: ncEmail || undefined }
          : undefined,
        source,
        items: lineItems.map(li => ({ product_id: li.productId, product_name: li.name, unit_price: li.price, quantity: li.qty })),
        shipping_amount: shipping,
        discount_amount: discount,
        tax_amount: 0,
        customer_note: customerNote || undefined,
        shipping_address: shippingAddress,
      })
      router.push(`/dashboard/orders/${res.order.id}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/dashboard/orders')} className="rounded-xl border border-gray-200 bg-white p-2 hover:bg-gray-50" aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold">Create order</h1>
          <p className="text-sm text-gray-500">Add items, set the customer and shipping details.</p>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="font-bold">Customer</h3>
          <div className="mt-3 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={newCustomer} onChange={e => setNewCustomer(e.target.checked)} className="h-4 w-4" />
              New customer (walk-in / guest)
            </label>

            {newCustomer ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Full name" required><Input value={ncName} onChange={e => setNcName(e.target.value)} /></Field>
                <Field label="Phone" required><Input value={ncPhone} onChange={e => setNcPhone(e.target.value)} /></Field>
                <Field label="Email"><Input value={ncEmail} onChange={e => setNcEmail(e.target.value)} /></Field>
              </div>
            ) : (
              <Field label="Select customer" required>
                <Select value={customerId} onChange={e => setCustomerId(e.target.value)}>
                  <option value="">Select…</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.fullName} · {c.phone}</option>)}
                </Select>
              </Field>
            )}

            <Field label="Source">
              <Select value={source} onChange={e => setSource(e.target.value)}>
                <option value="manual_order">Manual</option>
                <option value="payment_link">Payment link</option>
                <option value="website_api">Website</option>
                <option value="instagram">Instagram</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="imported">Imported</option>
                <option value="other">Other</option>
              </Select>
            </Field>
          </div>

          <h3 className="mt-6 font-bold">Shipping address</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Recipient name"><Input value={addrName} onChange={e => setAddrName(e.target.value)} /></Field>
            <Field label="Phone"><Input value={addrPhone} onChange={e => setAddrPhone(e.target.value)} /></Field>
            <Field label="Address line 1"><Input value={addrLine1} onChange={e => setAddrLine1(e.target.value)} /></Field>
            <Field label="Address line 2"><Input value={addrLine2} onChange={e => setAddrLine2(e.target.value)} /></Field>
            <Field label="City"><Input value={addrCity} onChange={e => setAddrCity(e.target.value)} /></Field>
            <Field label="State"><Input value={addrState} onChange={e => setAddrState(e.target.value)} /></Field>
            <Field label="Pincode"><Input value={addrPincode} onChange={e => setAddrPincode(e.target.value)} /></Field>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Items</h3>
              <button onClick={addLine} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold hover:bg-gray-50">
                <Plus className="h-3.5 w-3.5" /> Add item
              </button>
            </div>

            {lineItems.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">No items yet. Click “Add item” to start (uses your active product catalog).</p>
            ) : (
              <div className="mt-3 space-y-3">
                {lineItems.map((li, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Select value={li.productId} onChange={e => updateLine(idx, e.target.value)} className="flex-1">
                      <option value="" disabled>Select product…</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name} — {formatMoney(p.price)}</option>)}
                    </Select>
                    <Input type="number" min={1} value={li.qty} onChange={e => setLineItems(prev => prev.map((x, i) => i === idx ? { ...x, qty: Math.max(1, parseInt(e.target.value) || 1) } : x))} className="w-20" />
                    <span className="w-20 text-right text-sm font-semibold">{formatMoney(li.price * li.qty)}</span>
                    <button onClick={() => removeLine(idx)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500" aria-label="Remove">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2">
              <Field label="Shipping (INR)"><Input type="number" min={0} value={shippingAmount} onChange={e => setShippingAmount(e.target.value)} /></Field>
              <Field label="Discount (INR)"><Input type="number" min={0} value={discountAmount} onChange={e => setDiscountAmount(e.target.value)} /></Field>
            </div>

            <div className="mt-4 space-y-1 border-t border-gray-100 pt-3 text-sm">
              <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div>
              {discount > 0 && <div className="flex justify-between text-gray-500"><span>Discount</span><span>−{formatMoney(discount)}</span></div>}
              <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-extrabold"><span>Total</span><span>{formatMoney(total)}</span></div>
            </div>

            <Field label="Customer note"><Textarea value={customerNote} onChange={e => setCustomerNote(e.target.value)} placeholder="e.g. fragile, gift-wrap…" /></Field>
          </Card>

          <div className="flex justify-end gap-2">
            <button onClick={() => router.push('/dashboard/orders')} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50">Cancel</button>
            <button onClick={submit} disabled={busy} className="rounded-xl bg-charcoal px-6 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? 'Creating…' : 'Create order'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}