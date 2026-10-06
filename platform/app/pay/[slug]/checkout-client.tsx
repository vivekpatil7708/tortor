'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { claimPaid, customerView, fetchPaymentStatus, nextCheckDelay } from '@/lib/checkout-status'
import { UPI_APPS } from '@/lib/constants'
import { buildAppDeepLink, buildUpiIntentUrl, buildUpiPayUrl } from '@/lib/upi'
import { buttonRadius, formatAmount, generateTxnId } from '@/lib/utils'
import { isValidRedirectUrl } from '@/lib/validate-url'

interface CheckoutData {
  link: {
    id: string
    upi_id: string
    title: string
    description?: string | null
    amount?: number | null
    amount_flexible: boolean
    min_amount?: number | null
    max_amount?: number | null
    button_text?: string | null
    custom_fields?: Array<{ name: string; label: string; type: string; required: boolean }>
    redirect_url?: string | null
    slug: string
  }
  merchant: {
    business_logo_url?: string | null
    bg_image_url?: string | null
    brand_color_primary?: string
    brand_color_secondary?: string
    button_style?: string
    page_theme?: string
  }
}

interface Props {
  data: CheckoutData
  /** A payment already started on this link (from ?txn=), still waiting for the merchant. */
  resume?: { txn_id: string; amount: number; status: string } | null
}

export default function CheckoutClient({ data, resume }: Props) {
  const router = useRouter()
  const link = data.link
  const merchant = data.merchant

  const [amount, setAmount] = useState(resume ? resume.amount : link.amount ? Number(link.amount) : 0)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerNote, setCustomerNote] = useState('')
  const [fieldValues, setFieldValues] = useState<Record<string, string | string[]>>({})
  const [step, setStep] = useState<'form' | 'pay'>(resume ? 'pay' : 'form')
  const [txnId, setTxnId] = useState(resume?.txn_id ?? '')
  const [paymentStatus, setPaymentStatus] = useState<string>(resume?.status ?? 'initiated')
  // Each round of status checks starts fast and thins out; a new round starts after
  // "I've paid" or "Check again".
  const [checkRound, setCheckRound] = useState(0)
  const [checkingStopped, setCheckingStopped] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [confirming, setConfirming] = useState(false)
  const [starting, setStarting] = useState(false)
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set())
  const [quantities, setQuantities] = useState<Record<number, number>>({})

  const primaryColor = merchant.brand_color_primary || '#7bb86c'
  const secondaryColor = merchant.brand_color_secondary || '#2c2c2c'
  const btnRadius = buttonRadius(merchant.button_style || 'rounded')
  const isDark = merchant.page_theme === 'dark'
  const bg = merchant.bg_image_url
    ? 'bg-cover bg-center bg-no-repeat'
    : isDark ? 'bg-gray-900 text-white' : 'bg-cream text-charcoal'
  const bgStyle = merchant.bg_image_url ? { backgroundImage: `url(${merchant.bg_image_url})` } : undefined
  const cardBg = isDark
    ? 'bg-black/30 border-white/10 shadow-2xl shadow-black/30'
    : 'bg-white/30 border-white/40 shadow-2xl shadow-black/10'
  const inputBg = isDark
    ? 'bg-white/10 border-white/10 text-white placeholder:text-white/40 focus:border-white/30'
    : 'bg-white/50 border-white/60 text-charcoal placeholder:text-gray-400 focus:border-white/80'
  const ctaText = link.button_text || 'Continue to Pay'

  /** Leaves the payment step once the merchant has confirmed or rejected the payment. */
  const finish = useCallback((status: string, id: string) => {
    if (customerView(status) === 'confirmed' && link.redirect_url && isValidRedirectUrl(link.redirect_url)) {
      window.location.replace(link.redirect_url)
    } else {
      // The status page reads the outcome from the database ("confirmed" or "not confirmed").
      router.replace(`/pay/${link.slug}/success?txn=${encodeURIComponent(id)}`)
    }
  }, [link.redirect_url, link.slug, router])

  useEffect(() => {
    if (!txnId || step !== 'pay') return
    let stopped = false
    let checking = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const startedAt = Date.now()

    async function check() {
      if (stopped || checking) return
      checking = true
      const status = await fetchPaymentStatus(txnId)
      checking = false
      if (stopped) return
      if (status && customerView(status) !== 'waiting') {
        stopped = true
        finish(status, txnId)
        return
      }
      if (status === 'pending') setPaymentStatus('pending')
      schedule()
    }

    function schedule() {
      clearTimeout(timer)
      // Hidden tabs (the customer is in the UPI app) don't check; coming back checks at once.
      if (stopped || document.hidden) return
      const delay = nextCheckDelay(Date.now() - startedAt)
      if (delay === null) {
        setCheckingStopped(true)
        return
      }
      timer = setTimeout(check, delay)
    }

    function onVisibilityChange() {
      if (stopped || document.hidden) return
      clearTimeout(timer)
      check()
    }

    setCheckingStopped(false)
    // A round started by "I've paid" or "Check again" asks straight away.
    if (checkRound > 0) check()
    else schedule()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stopped = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [txnId, step, checkRound, finish])

  function validateName(name: string): string | null {
    const trimmed = name.trim()
    if (!trimmed) return 'Name is required'
    if (trimmed.length < 2) return 'Name must be at least 2 characters'
    if (trimmed.length > 50) return 'Name must be under 50 characters'
    if (!/^[A-Za-z\s.\-']+$/.test(trimmed)) return 'Name can only contain letters, spaces, dots, hyphens, and apostrophes'
    return null
  }

  function validatePhone(phone: string): string | null {
    const trimmed = phone.trim()
    if (!trimmed) return 'Phone is required'
    const digits = trimmed.replace(/\D/g, '')
    if (digits.length < 10) return 'Phone must have at least 10 digits'
    if (digits.length > 15) return 'Phone number too long'
    if (!/^\+?\d{1,4}[\d\s\-]{7,15}$/.test(trimmed)) return 'Enter a valid phone number with country code (e.g. +919999999999)'
    return null
  }

  async function handleProceed() {
    if (starting) return
    const nameErr = validateName(customerName)
    if (nameErr) { setError(nameErr); return }
    const phoneErr = validatePhone(customerPhone)
    if (phoneErr) { setError(phoneErr); return }
    if (hasProducts && !isAnyProductSelected) {
      setError('Please select at least one product')
      return
    }
    const payAmount = displayAmount
    if (link.amount_flexible && payAmount < (link.min_amount || 1)) {
      setError(`Minimum amount is ₹${link.min_amount || 1}`)
      return
    }
    if (link.amount_flexible && link.max_amount && payAmount > link.max_amount) {
      setError(`Maximum amount is ₹${link.max_amount}`)
      return
    }

    const newFieldErrors: Record<string, string> = {}
    for (const f of customFields) {
      if (f.required) {
        const val = fieldValues[f.name]
        if (!val || (Array.isArray(val) && val.length === 0) || (typeof val === 'string' && !val.trim())) {
          newFieldErrors[f.name] = `"${f.label}" is required`
        }
      }
    }
    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors)
      setError('Please fill in all required fields')
      return
    }
    setFieldErrors({})

    const id = generateTxnId()
    setError('')
    setStarting(true)

    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_link_id: link.id,
        txn_id: id,
        amount: payAmount,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail || null,
        customer_note: customerNote || null,
        custom_field_values: {
          ...Object.fromEntries(
            Object.entries(fieldValues).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v])
          ),
          ...(hasProducts && isAnyProductSelected ? {
            _selected_products: (hasQuantityProducts
              ? productItems.map((p: any, i: number) => ({
                  name: p?.name || `Item ${i + 1}`,
                  price: p?.price || '0',
                  category: p?.category || '',
                  quantity: qtyOf(i),
                }))
              : Array.from(selectedProducts).map(i => ({
                  name: productItems[i]?.name || `Item ${i + 1}`,
                  price: productItems[i]?.price || '0',
                  category: productItems[i]?.category || '',
                  quantity: 1,
                }))
            )
          } : {}),
        },
      }),
    }).catch(() => null)
    setStarting(false)

    if (!res || !res.ok) {
      const data = res ? await res.json().catch(() => ({})) : {}
      setError((data as { error?: string }).error || 'Could not start the payment. Please check your connection and try again.')
      return
    }

    // Show payment options only once the order is saved, so every payment has a record.
    setTxnId(id)
    if (hasProducts) setAmount(payAmount)
    setPaymentStatus('initiated')
    setStep('pay')
    // Keep the payment in the address, so a refresh or the trip to the UPI app reopens it.
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?txn=${encodeURIComponent(id)}`)
  }

  /** Back to the form for a fresh payment (only offered before "I've paid"). */
  function startOver() {
    window.history.replaceState(window.history.state, '', window.location.pathname)
    setStep('form')
    setTxnId('')
    setPaymentStatus('initiated')
    setCheckingStopped(false)
    setError('')
  }

  function openUpi(appName?: string) {
    const vpa = link.upi_id
    const note = link.title
    const upiUrl = buildUpiPayUrl(vpa, amount, txnId, note)
    const isAndroid = /android/i.test(navigator.userAgent)

    if (appName) {
      const app = UPI_APPS.find(a => a.name === appName)
      if (app) {
        window.location.href = buildAppDeepLink(app, vpa, amount, txnId, note)
        return
      }
    }

    if (isAndroid && /chrome/i.test(navigator.userAgent)) {
      window.location.href = buildUpiIntentUrl(vpa, amount, txnId, note)
    } else {
      window.location.href = upiUrl
    }
  }

  async function markAsPaid() {
    if (confirming) return
    setConfirming(true)
    setError('')
    const result = await claimPaid(txnId)
    setConfirming(false)
    if (result.ok) {
      if (customerView(result.status) !== 'waiting') {
        finish(result.status, txnId)
        return
      }
      setPaymentStatus('pending')
      setCheckRound(r => r + 1)
      return
    }
    setError(result.error)
    // The merchant may already have confirmed or rejected it: follow the stored status.
    const status = await fetchPaymentStatus(txnId)
    if (status && customerView(status) !== 'waiting') finish(status, txnId)
  }

  const qrSrc = `/api/qr?vpa=${encodeURIComponent(link.upi_id)}&amount=${amount}&txn_id=${encodeURIComponent(txnId)}&note=${encodeURIComponent(link.title)}`

  if (step === 'pay') {
    return (
      <div className={`flex min-h-screen items-center justify-center ${bg} p-4`} style={bgStyle}>
        <div className={`w-full max-w-md rounded-3xl border p-8 backdrop-blur-xl ${cardBg}`}>
          <div className="mb-6 text-center">
            {merchant.business_logo_url && (
              <img src={merchant.business_logo_url} className="mx-auto mb-3 h-12 object-contain" alt="" />
            )}
            <div className="text-4xl font-bold tracking-tight" style={{ color: secondaryColor }}>
              {formatAmount(amount)}
            </div>
            <p className="mt-1 text-sm opacity-70">{link.title}</p>
            <p className="mt-1 font-mono text-xs opacity-50">{txnId}</p>
          </div>

          {paymentStatus === 'pending' ? (
            <div className="mb-6 rounded-xl bg-amber-50 p-4 text-center text-sm text-amber-800">
              Payment marked as sent. Waiting for merchant confirmation.
            </div>
          ) : (
            <>
              <div className="mb-4 flex justify-center">
                <img src={qrSrc} className="h-44 w-44 rounded-xl bg-white p-2" alt="UPI QR Code" />
              </div>
              <p className="mb-4 text-center text-sm opacity-70">Scan with any UPI app or tap below</p>

              <button onClick={() => openUpi()}
                className={`mb-3 w-full py-3.5 text-base font-bold text-white ${btnRadius}`}
                style={{ backgroundColor: primaryColor }}>
                {ctaText} — {formatAmount(amount)}
              </button>

              <div className="mb-4 grid grid-cols-3 gap-2">
                {UPI_APPS.slice(0, 6).map(app => (
                  <button key={app.name} onClick={() => openUpi(app.name)}
                    className={`border border-white/20 bg-white/20 py-2 text-xs font-semibold backdrop-blur-md transition-all hover:bg-white/40 ${btnRadius}`}>
                    {app.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            </>
          )}

          {error && <p className="mb-3 text-center text-sm text-red-500">{error}</p>}

          <button onClick={markAsPaid} disabled={confirming || paymentStatus === 'pending'}
            className={`mb-2 w-full border border-white/20 bg-white/20 py-2.5 text-sm font-semibold backdrop-blur-md transition-all hover:bg-white/40 ${btnRadius} disabled:opacity-50`}>
            {confirming ? 'Updating...' : "I've completed payment"}
          </button>

          {checkingStopped && (
            <p className="mt-3 text-center text-xs opacity-70">
              This page has stopped checking for updates.{' '}
              <button onClick={() => setCheckRound(r => r + 1)} className="font-semibold underline">Check again</button>
            </p>
          )}

          <p className="mt-4 text-center text-xs opacity-50">
            Pay to <span className="font-mono">{link.upi_id}</span>
          </p>

          {paymentStatus === 'initiated' && (
            <button onClick={startOver} className="mt-3 w-full text-center text-xs underline opacity-50 hover:opacity-80">
              Start over
            </button>
          )}
        </div>
      </div>
    )
  }

  const allFields = (link.custom_fields || []) as any[]
  const customFields = allFields.filter((f: any) => f._type !== 'products')
  const productItems = allFields.find((f: any) => f._type === 'products')?.items || []

  const hasQuantityProducts = productItems.some((p: any) => p.quantity && Number(p.quantity) > 1)
  const maxQtyOf = (i: number) => {
    const q = productItems[i]?.quantity
    return q && Number(q) > 0 ? Number(q) : 1
  }
  const qtyOf = (i: number) => Math.min(Math.max(1, quantities[i] || 1), maxQtyOf(i))

  const productSubtotal = productItems.reduce((sum: number, p: any, i: number) => {
    const price = parseFloat(p?.price)
    const base = isNaN(price) ? 0 : price
    if (hasQuantityProducts) {
      const q = maxQtyOf(i) > 1 ? qtyOf(i) : 1
      return sum + base * q
    }
    return sum + (selectedProducts.has(i) ? base : 0)
  }, 0)
  const hasProducts = productItems.length > 0
  const isAnyProductSelected = hasQuantityProducts || selectedProducts.size > 0
  const displayAmount = hasProducts && isAnyProductSelected ? productSubtotal : (hasProducts ? 0 : amount)

  function toggleProduct(i: number) {
    setSelectedProducts(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  function toggleMultiselect(fieldName: string, option: string) {
    const current: string[] = (fieldValues[fieldName] as unknown as string[]) || []
    const updated = current.includes(option)
      ? current.filter((v: string) => v !== option)
      : [...current, option]
    setFieldValues({ ...fieldValues, [fieldName]: updated })
  }

  return (
    <div className={`flex min-h-screen items-center justify-center ${bg} p-4`} style={bgStyle}>
      <div className={`w-full max-w-sm rounded-3xl border p-8 backdrop-blur-xl ${cardBg}`}>
        <div className="mb-6 text-center">
          {merchant.business_logo_url && (
            <img src={merchant.business_logo_url} className="mx-auto mb-3 h-12 object-contain" alt="" />
          )}
          <h1 className="text-xl font-bold" style={{ color: secondaryColor }}>{link.title}</h1>
          {link.description && <p className="mt-1 text-sm opacity-70">{link.description}</p>}
        </div>

        <div className="space-y-4">
          {hasProducts ? (
            <div className="text-center">
              {displayAmount > 0 ? (
                <div className="text-4xl font-bold tracking-tight" style={{ color: secondaryColor }}>
                  ₹{displayAmount.toFixed(2)}
                </div>
              ) : (
                <p className="text-xs opacity-50">Select products below</p>
              )}
            </div>
          ) : link.amount_flexible ? (
            <div>
              <label className="mb-1 block text-xs font-semibold opacity-70">Amount (₹) <span className="text-red-400">*</span></label>
              <input type="number" value={amount || ''} onChange={e => setAmount(Number(e.target.value))} required
                className={`w-full rounded-xl border px-4 py-3 text-sm outline-none backdrop-blur-md transition-all focus:ring-2 focus:ring-white/30 ${inputBg}`} />
            </div>
          ) : (
            <div className="text-center">
              <div className="text-4xl font-bold tracking-tight" style={{ color: secondaryColor }}>
                {formatAmount(amount)}
              </div>
            </div>
          )}

          <div>
              <label className="mb-1 block text-xs font-semibold opacity-70">Your Name <span className="text-red-400">*</span></label>
            <input value={customerName} onChange={e => { setCustomerName(e.target.value.replace(/[^A-Za-z\s.\-']/g, '').slice(0, 50)); setFieldErrors(p => ({...p, name: ''})) }} required
              className={`w-full rounded-xl border px-4 py-3 text-sm outline-none backdrop-blur-md transition-all focus:ring-2 focus:ring-white/30 ${inputBg}`} />
            {fieldErrors.name && <p className="mt-1 text-xs text-red-400">{fieldErrors.name}</p>}
          </div>
          <div>
              <label className="mb-1 block text-xs font-semibold opacity-70">Phone <span className="text-red-400">*</span></label>
            <input type="tel" value={customerPhone} onChange={e => { setCustomerPhone(e.target.value.replace(/[^+\d\s\-]/g, '').slice(0, 16)); setFieldErrors(p => ({...p, phone: ''})) }} required
              className={`w-full rounded-xl border px-4 py-3 text-sm outline-none backdrop-blur-md transition-all focus:ring-2 focus:ring-white/30 ${inputBg}`} />
            {fieldErrors.phone && <p className="mt-1 text-xs text-red-400">{fieldErrors.phone}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold opacity-70">Email</label>
            <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)}
              className={`w-full rounded-xl border px-4 py-3 text-sm outline-none backdrop-blur-md transition-all focus:ring-2 focus:ring-white/30 ${inputBg}`} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold opacity-70">Note</label>
            <textarea value={customerNote} onChange={e => setCustomerNote(e.target.value)} rows={2}
              className={`w-full rounded-xl border px-4 py-3 text-sm outline-none backdrop-blur-md transition-all focus:ring-2 focus:ring-white/30 ${inputBg}`} />
          </div>

          {productItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold opacity-70">Products / Services</p>
              {hasQuantityProducts ? (
                productItems.map((p: any, i: number) => (
                  <div key={i} className="rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
                    <div className="flex items-start gap-3">
                      {p.image && <img src={p.image} className="h-12 w-12 flex-shrink-0 rounded-lg object-cover" alt="" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">{p.name}</p>
                        {p.description && <p className="mt-0.5 text-xs opacity-60 line-clamp-2">{p.description}</p>}
                        <p className="mt-1 text-sm font-semibold">₹{p.price}</p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2 rounded-full border border-white/25 bg-white/10 px-1 py-1">
                        <button type="button" onClick={() => setQuantities({ ...quantities, [i]: qtyOf(i) - 1 })}
                          disabled={qtyOf(i) <= 1}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-base font-bold disabled:opacity-30">−</button>
                        <span className="w-6 text-center text-sm font-bold">{qtyOf(i)}</span>
                        <button type="button" onClick={() => setQuantities({ ...quantities, [i]: qtyOf(i) + 1 })}
                          disabled={qtyOf(i) >= maxQtyOf(i)}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-base font-bold disabled:opacity-30">+</button>
                      </div>
                    </div>
                    <p className="mt-2 text-right text-xs opacity-50">Up to {maxQtyOf(i)} available</p>
                  </div>
                ))
              ) : (
                productItems.map((p: any, i: number) => {
                  const sel = selectedProducts.has(i)
                  return (
                    <label key={i} className={`flex cursor-pointer gap-3 rounded-xl border p-3 backdrop-blur-sm transition-all ${sel ? 'border-white/40 bg-white/20' : 'border-white/20 bg-white/10 hover:bg-white/15'}`}>
                      {p.image && <img src={p.image} className="h-14 w-14 flex-shrink-0 rounded-lg object-cover" alt="" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold">{p.name}</p>
                          <input type="checkbox" checked={sel} onChange={() => toggleProduct(i)}
                            className="mt-0.5 h-4 w-4 flex-shrink-0 rounded" />
                        </div>
                        {p.category && <p className="text-xs opacity-60">{p.category}</p>}
                        {p.description && <p className="mt-1 text-xs opacity-70 line-clamp-2">{p.description}</p>}
                        <div className="mt-1 flex items-center justify-between">
                          {p.price && <p className="text-sm font-semibold">₹{p.price}</p>}
                          <span className={`text-xs ${p.availability === 'in-stock' ? 'text-green-400' : p.availability === 'out-of-stock' ? 'text-red-400' : 'text-amber-400'}`}>
                            {p.availability === 'in-stock' ? 'In Stock' : p.availability === 'out-of-stock' ? 'Out of Stock' : 'Pre-order'}
                          </span>
                        </div>
                      </div>
                    </label>
                  )
                })
              )}
              {displayAmount > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-white/30 bg-white/20 p-3 backdrop-blur-sm">
                  <span className="text-xs font-semibold opacity-70">{hasQuantityProducts ? 'Order total' : `Subtotal (${selectedProducts.size} item${selectedProducts.size > 1 ? 's' : ''})`}</span>
                  <span className="text-lg font-bold">₹{productSubtotal.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          {customFields.map((f: any, i: number) => (
            <div key={i}>
              <label className="mb-1 block text-xs font-semibold opacity-70">{f.label}{f.required && <span className="text-red-400"> *</span>}</label>
              {f.type === 'multiselect' ? (
                <div className="space-y-1.5">
                  {(f.options || []).map((opt: string) => {
                    const val = fieldValues[f.name]
                    const checked = Array.isArray(val) && val.includes(opt)
                    return (
                      <label key={opt} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-all ${checked ? 'bg-white/20' : 'bg-white/5'}`}>
                        <input type="checkbox" checked={checked}
                          onChange={() => { toggleMultiselect(f.name, opt); setFieldErrors(p => ({...p, [f.name]: ''})) }}
                          className="h-3.5 w-3.5 rounded" />
                        {opt}
                      </label>
                    )
                  })}
                </div>
              ) : (
                <input type={f.type} value={fieldValues[f.name] as string || ''}
                  onChange={e => { setFieldValues({ ...fieldValues, [f.name]: e.target.value }); setFieldErrors(p => ({...p, [f.name]: ''})) }} required={f.required}
                  className={`w-full rounded-xl border px-4 py-3 text-sm outline-none backdrop-blur-md transition-all focus:ring-2 focus:ring-white/30 ${inputBg}`} />
              )}
              {fieldErrors[f.name] && <p className="mt-1 text-xs text-red-400">{fieldErrors[f.name]}</p>}
            </div>
          ))}
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <button onClick={handleProceed} disabled={starting}
          className={`mt-6 w-full py-3.5 text-base font-bold text-white disabled:opacity-60 ${btnRadius}`}
          style={{ backgroundColor: primaryColor }}>
          {starting ? 'Please wait...' : ctaText}
        </button>

        <p className="mt-4 text-center text-xs opacity-50">Powered by ToroPay</p>
      </div>
    </div>
  )
}
