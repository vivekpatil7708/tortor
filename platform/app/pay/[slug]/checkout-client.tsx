'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, QrCode, ShieldCheck } from 'lucide-react'
import { amountRangeHint, checkoutFormErrors, customFieldKey } from '@/lib/checkout-form'
import { claimPaid, customerView, fetchPaymentStatus, nextCheckDelay } from '@/lib/checkout-status'
import { UPI_APPS } from '@/lib/constants'
import { buildAppDeepLink, buildUpiIntentUrl, buildUpiPayUrl } from '@/lib/upi'
import { buttonRadius, formatAmount, generateTxnId } from '@/lib/utils'
import { isValidRedirectUrl } from '@/lib/validate-url'
import CopyButton from '@/components/ui/copy-button'

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
    business_name?: string | null
    business_logo_url?: string | null
    bg_image_url?: string | null
    brand_color_primary?: string
    brand_color_secondary?: string
    button_style?: string
    page_theme?: string
  }
}

// Computers (a mouse and a wide screen) scan the QR code with a phone. Phones and
// tablets, in either orientation, pay in a UPI app on the same device.
const COMPUTER_ONLY = 'hidden [@media(pointer:fine)_and_(min-width:768px)]:block'
const NOT_ON_COMPUTER = '[@media(pointer:fine)_and_(min-width:768px)]:hidden'

interface Props {
  data: CheckoutData
  /** A payment already started on this link (from ?txn=), still waiting for the merchant. */
  resume?: { txn_id: string; amount: number; status: string } | null
}

export default function CheckoutClient({ data, resume }: Props) {
  const router = useRouter()
  const link = data.link
  const merchant = data.merchant
  // Who the customer is paying. Also sent to UPI apps so they can show it.
  const payeeName = merchant.business_name?.trim() || ''
  const seller = payeeName || 'the seller'

  const [amount, setAmount] = useState(resume ? resume.amount : link.amount ? Number(link.amount) : 0)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerNote, setCustomerNote] = useState('')
  const [showOptional, setShowOptional] = useState(false)
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
  const pageBg = merchant.bg_image_url ? 'bg-cover bg-center bg-no-repeat' : isDark ? 'bg-gray-950' : 'bg-cream'
  const bgStyle = merchant.bg_image_url ? { backgroundImage: `url(${merchant.bg_image_url})` } : undefined
  const headingColor = isDark ? undefined : secondaryColor
  const theme = isDark
    ? {
        card: 'border-white/10 bg-gray-900/95 text-white', muted: 'text-white/75', subtle: 'text-white/60',
        panel: 'border-white/15 bg-white/5', selected: 'border-white/70 bg-white/15',
        control: 'border-white/20 bg-white/10', ghost: 'border-white/20 bg-white/10 hover:bg-white/20',
        input: 'border-white/30 bg-white/10 text-white placeholder:text-white/40 focus:border-white/70 focus:ring-white/20',
        strong: 'bg-white text-gray-900', footer: 'border-white/10 bg-gray-900/95', error: 'text-red-300',
        inStock: 'text-green-400', outOfStock: 'text-red-300', preOrder: 'text-amber-300',
      }
    : {
        card: 'border-white bg-white/95 text-charcoal', muted: 'text-gray-600', subtle: 'text-gray-500',
        panel: 'border-gray-200 bg-gray-50', selected: 'border-gray-500 bg-white ring-1 ring-gray-400',
        control: 'border-gray-300 bg-white', ghost: 'border-gray-200 bg-white hover:bg-gray-50',
        input: 'border-gray-400 bg-white text-charcoal placeholder:text-gray-400 focus:border-gray-600 focus:ring-gray-200',
        strong: 'bg-charcoal text-white', footer: 'border-gray-200 bg-white/95', error: 'text-red-600',
        inStock: 'text-green-700', outOfStock: 'text-red-600', preOrder: 'text-amber-700',
      }
  const inputClass = `w-full rounded-xl border px-4 py-3 text-base outline-none transition focus:ring-2 ${theme.input}`
  const labelClass = `mb-1 block text-sm font-semibold ${theme.muted}`
  const errorClass = `mt-1 text-sm ${theme.error}`
  const ctaText = link.button_text || 'Continue to Pay'

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

  function clearError(key: string) {
    setFieldErrors(prev => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  async function handleProceed() {
    if (starting) return
    const errors = checkoutFormErrors({
      name: customerName,
      phone: customerPhone,
      amount: displayAmount,
      flexible: link.amount_flexible,
      minAmount: link.min_amount ?? null,
      maxAmount: link.max_amount ?? null,
      hasProducts,
      productChosen: isAnyProductSelected,
      customFields: customFields.map((f: any) => ({ name: f.name, label: f.label, required: Boolean(f.required) })),
      fieldValues,
    })
    setFieldErrors(errors)
    // Every problem shows under its own field; take the customer to the first one.
    const targets = [
      hasProducts ? { key: 'products', id: 'checkout-products' } : { key: 'amount', id: 'checkout-amount' },
      { key: 'name', id: 'checkout-name' },
      { key: 'phone', id: 'checkout-phone' },
      ...customFields.map((f: any, i: number) => ({ key: customFieldKey(f.name), id: `checkout-custom-${i}` })),
    ]
    const first = targets.find(t => errors[t.key])
    if (first) {
      document.getElementById(first.id)?.focus()
      return
    }

    const payAmount = displayAmount
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
    const upiUrl = buildUpiPayUrl(vpa, amount, txnId, note, payeeName)
    const isAndroid = /android/i.test(navigator.userAgent)

    if (appName) {
      const app = UPI_APPS.find(a => a.name === appName)
      if (app) {
        window.location.href = buildAppDeepLink(app, vpa, amount, txnId, note, payeeName)
        return
      }
    }

    if (isAndroid && /chrome/i.test(navigator.userAgent)) {
      window.location.href = buildUpiIntentUrl(vpa, amount, txnId, note, payeeName)
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

  const logo = merchant.business_logo_url
    ? <img src={merchant.business_logo_url} className="mx-auto mb-2 h-12 object-contain" alt="" />
    : null
  const trustLine = (
    <p className={`mt-5 flex items-start justify-center gap-1.5 text-center text-xs ${theme.subtle}`}>
      <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>You pay {seller} directly with UPI. ToroPay never holds your money.</span>
    </p>
  )

  if (step === 'pay') {
    const qrSrc = `/api/qr?vpa=${encodeURIComponent(link.upi_id)}&amount=${amount}&txn_id=${encodeURIComponent(txnId)}&note=${encodeURIComponent(link.title)}${payeeName ? `&pn=${encodeURIComponent(payeeName)}` : ''}`
    const qrAlt = `UPI QR code to pay ${formatAmount(amount)} to ${seller}`

    return (
      <div className={`flex min-h-screen items-center justify-center p-4 ${pageBg}`} style={bgStyle}>
        <div className={`w-full max-w-md rounded-3xl border p-6 shadow-2xl shadow-black/10 sm:p-8 ${theme.card}`}>
          <div className="mb-5 text-center">
            {logo}
            {payeeName && <p className={`text-sm font-semibold ${theme.muted}`}>{payeeName}</p>}
            <div className="mt-1 text-4xl font-bold tracking-tight" style={{ color: headingColor }}>{formatAmount(amount)}</div>
            <p className={`mt-1 text-sm ${theme.muted}`}>{link.title}</p>
          </div>

          <div className={`mb-5 rounded-2xl border px-4 py-3 ${theme.panel}`}>
            <p className={`text-xs ${theme.subtle}`}>Paying</p>
            {payeeName && <p className="font-semibold">{payeeName}</p>}
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <span className="break-all font-mono text-sm">{link.upi_id}</span>
              <CopyButton text={link.upi_id} label="Copy UPI ID" className={`border ${theme.ghost}`} />
            </div>
          </div>

          {paymentStatus === 'pending' ? (
            <div role="status" className="rounded-2xl bg-amber-50 p-4 text-center text-sm text-amber-900">
              <p className="font-semibold">Payment sent. Waiting for {seller} to confirm.</p>
              <p className="mt-1">
                This page updates by itself once {seller} confirms. You can also close it; keep the
                reference below in case you need to contact {seller}.
              </p>
            </div>
          ) : (
            <>
              {/* Phones: pay in a UPI app first. The QR is for paying from another phone. */}
              <div className={NOT_ON_COMPUTER}>
                <p className="mb-2 text-sm font-semibold">1. Pay in your UPI app</p>
                <button onClick={() => openUpi()}
                  className={`w-full py-3.5 text-base font-bold text-white ${btnRadius}`}
                  style={{ backgroundColor: primaryColor }}>
                  Pay {formatAmount(amount)} with any UPI app
                </button>
                <p className={`mb-2 mt-3 text-xs ${theme.subtle}`}>Or open a specific app</p>
                <div className="grid grid-cols-3 gap-2">
                  {UPI_APPS.map(app => (
                    <button key={app.name} onClick={() => openUpi(app.name)}
                      className={`border px-1 py-2.5 text-xs font-semibold transition ${theme.ghost} ${btnRadius}`}>
                      {app.name}
                    </button>
                  ))}
                </div>
                <details className={`group mt-4 rounded-2xl border px-4 py-3 ${theme.panel}`}>
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                    <QrCode className="h-4 w-4 shrink-0" aria-hidden />
                    <span>Paying from another phone? Show QR code</span>
                    <ChevronDown className="ml-auto h-4 w-4 shrink-0 transition group-open:rotate-180" aria-hidden />
                  </summary>
                  <img src={qrSrc} className="mx-auto mt-3 h-48 w-48 rounded-xl bg-white p-2" alt={qrAlt} />
                </details>
              </div>

              {/* Computers: scan the QR code with a phone. */}
              <div className={`text-center ${COMPUTER_ONLY}`}>
                <p className="mb-3 text-sm font-semibold">1. Scan with any UPI app on your phone</p>
                <img src={qrSrc} className="mx-auto h-52 w-52 rounded-xl bg-white p-2" alt={qrAlt} />
                <p className={`mt-2 text-xs ${theme.subtle}`}>Google Pay, PhonePe, Paytm, BHIM and other UPI apps all work.</p>
              </div>

              <div className={`mt-5 rounded-2xl border p-4 ${theme.panel}`}>
                <p className="text-sm font-semibold">2. Paid? Tell {seller}</p>
                <p className={`mt-1 text-sm ${theme.muted}`}>
                  After paying, tap below so {seller} can check and confirm it. You&apos;ll see the confirmation on this page.
                </p>
                {error && <p role="alert" className={`mt-2 text-sm ${theme.error}`}>{error}</p>}
                <button onClick={markAsPaid} disabled={confirming}
                  className={`mt-3 w-full py-3 text-sm font-bold transition disabled:opacity-60 ${theme.strong} ${btnRadius}`}>
                  {confirming ? 'Saving…' : "I've paid"}
                </button>
              </div>
            </>
          )}

          {checkingStopped && (
            <p className={`mt-3 text-center text-xs ${theme.muted}`}>
              This page has stopped checking for updates.{' '}
              <button onClick={() => setCheckRound(r => r + 1)} className="font-semibold underline">Check again</button>
            </p>
          )}

          <div className={`mt-5 flex flex-wrap items-center justify-center gap-2 text-xs ${theme.subtle}`}>
            <span>Reference: <span className="font-mono">{txnId}</span></span>
            <CopyButton text={txnId} label="Copy" className={`border ${theme.ghost}`} />
          </div>

          {paymentStatus === 'initiated' && (
            <button onClick={startOver} className={`mt-3 w-full text-center text-xs underline ${theme.subtle}`}>
              Start over
            </button>
          )}

          {trustLine}
        </div>
      </div>
    )
  }

  function toggleProduct(i: number) {
    setSelectedProducts(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
    clearError('products')
  }

  function toggleMultiselect(fieldName: string, option: string) {
    const current: string[] = (fieldValues[fieldName] as unknown as string[]) || []
    const updated = current.includes(option)
      ? current.filter((v: string) => v !== option)
      : [...current, option]
    setFieldValues({ ...fieldValues, [fieldName]: updated })
  }

  const rangeHint = amountRangeHint(link.min_amount, link.max_amount)
  const describedBy = (key: string, id: string) => (fieldErrors[key] ? `${id}-error` : undefined)

  return (
    <div className={`flex min-h-screen items-center justify-center p-4 ${pageBg}`} style={bgStyle}>
      <div className={`w-full max-w-md rounded-3xl border p-6 shadow-2xl shadow-black/10 sm:p-8 ${theme.card}`}>
        <div className="mb-5 text-center">
          {logo}
          {payeeName && <p className={`text-sm font-semibold ${theme.muted}`}>{payeeName}</p>}
          <h1 className="mt-1 text-xl font-bold" style={{ color: headingColor }}>{link.title}</h1>
          {link.description && <p className={`mt-1 text-sm ${theme.muted}`}>{link.description}</p>}
        </div>

        <div className="space-y-5">
          {hasProducts ? (
            <section id="checkout-products" tabIndex={-1} aria-labelledby="checkout-products-title" className="space-y-2 outline-none">
              <p id="checkout-products-title" className={labelClass}>Choose items</p>
              {hasQuantityProducts ? (
                productItems.map((p: any, i: number) => (
                  <div key={i} className={`rounded-xl border p-4 ${theme.panel}`}>
                    <div className="flex items-start gap-3">
                      {p.image && <img src={p.image} className="h-12 w-12 flex-shrink-0 rounded-lg object-cover" alt="" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">{p.name}</p>
                        {p.description && <p className={`mt-0.5 line-clamp-2 text-xs ${theme.muted}`}>{p.description}</p>}
                        <p className="mt-1 text-sm font-semibold">₹{p.price}</p>
                      </div>
                      <div className={`flex flex-shrink-0 items-center gap-2 rounded-full border px-1 py-1 ${theme.control}`}>
                        <button type="button" aria-label={`One less ${p.name}`}
                          onClick={() => setQuantities({ ...quantities, [i]: qtyOf(i) - 1 })}
                          disabled={qtyOf(i) <= 1}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-base font-bold disabled:opacity-30">−</button>
                        <span className="w-6 text-center text-sm font-bold" aria-live="polite">{qtyOf(i)}</span>
                        <button type="button" aria-label={`One more ${p.name}`}
                          onClick={() => setQuantities({ ...quantities, [i]: qtyOf(i) + 1 })}
                          disabled={qtyOf(i) >= maxQtyOf(i)}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-base font-bold disabled:opacity-30">+</button>
                      </div>
                    </div>
                    <p className={`mt-2 text-right text-xs ${theme.subtle}`}>Up to {maxQtyOf(i)} available</p>
                  </div>
                ))
              ) : (
                productItems.map((p: any, i: number) => {
                  const sel = selectedProducts.has(i)
                  return (
                    <label key={i} className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${sel ? theme.selected : theme.panel}`}>
                      {p.image && <img src={p.image} className="h-14 w-14 flex-shrink-0 rounded-lg object-cover" alt="" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold">{p.name}</p>
                          <input type="checkbox" checked={sel} onChange={() => toggleProduct(i)}
                            className="mt-0.5 h-5 w-5 flex-shrink-0 rounded" />
                        </div>
                        {p.category && <p className={`text-xs ${theme.subtle}`}>{p.category}</p>}
                        {p.description && <p className={`mt-1 line-clamp-2 text-xs ${theme.muted}`}>{p.description}</p>}
                        <div className="mt-1 flex items-center justify-between">
                          {p.price && <p className="text-sm font-semibold">₹{p.price}</p>}
                          <span className={`text-xs font-medium ${p.availability === 'in-stock' ? theme.inStock : p.availability === 'out-of-stock' ? theme.outOfStock : theme.preOrder}`}>
                            {p.availability === 'in-stock' ? 'In stock' : p.availability === 'out-of-stock' ? 'Out of stock' : 'Pre-order'}
                          </span>
                        </div>
                      </div>
                    </label>
                  )
                })
              )}
              {displayAmount > 0 && (
                <div className={`flex items-center justify-between rounded-xl border p-3 ${theme.panel}`}>
                  <span className={`text-sm font-semibold ${theme.muted}`}>{hasQuantityProducts ? 'Order total' : `Subtotal (${selectedProducts.size} item${selectedProducts.size > 1 ? 's' : ''})`}</span>
                  <span className="text-lg font-bold">{formatAmount(productSubtotal)}</span>
                </div>
              )}
              {fieldErrors.products && <p role="alert" className={errorClass}>{fieldErrors.products}</p>}
            </section>
          ) : link.amount_flexible ? (
            <div>
              <label htmlFor="checkout-amount" className={labelClass}>Amount (₹) <span className="text-red-500">*</span></label>
              <input id="checkout-amount" type="number" inputMode="decimal" value={amount || ''}
                onChange={e => { setAmount(Number(e.target.value)); clearError('amount') }}
                aria-invalid={Boolean(fieldErrors.amount)}
                aria-describedby={[rangeHint ? 'checkout-amount-hint' : '', describedBy('amount', 'checkout-amount') ?? ''].filter(Boolean).join(' ') || undefined}
                className={inputClass} />
              {rangeHint && <p id="checkout-amount-hint" className={`mt-1 text-xs ${theme.subtle}`}>{rangeHint}</p>}
              {fieldErrors.amount && <p id="checkout-amount-error" role="alert" className={errorClass}>{fieldErrors.amount}</p>}
            </div>
          ) : (
            <div className="text-center">
              <div className="text-4xl font-bold tracking-tight" style={{ color: headingColor }}>{formatAmount(amount)}</div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="checkout-name" className={labelClass}>Your name <span className="text-red-500">*</span></label>
              <input id="checkout-name" autoComplete="name" value={customerName}
                onChange={e => { setCustomerName(e.target.value.replace(/[^A-Za-z\s.\-']/g, '').slice(0, 50)); clearError('name') }}
                aria-invalid={Boolean(fieldErrors.name)} aria-describedby={describedBy('name', 'checkout-name')}
                className={inputClass} />
              {fieldErrors.name && <p id="checkout-name-error" role="alert" className={errorClass}>{fieldErrors.name}</p>}
            </div>
            <div>
              <label htmlFor="checkout-phone" className={labelClass}>Phone <span className="text-red-500">*</span></label>
              <input id="checkout-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="10-digit mobile number" value={customerPhone}
                onChange={e => { setCustomerPhone(e.target.value.replace(/[^+\d\s\-]/g, '').slice(0, 16)); clearError('phone') }}
                aria-invalid={Boolean(fieldErrors.phone)} aria-describedby={describedBy('phone', 'checkout-phone')}
                className={inputClass} />
              {fieldErrors.phone && <p id="checkout-phone-error" role="alert" className={errorClass}>{fieldErrors.phone}</p>}
            </div>

            {customFields.map((f: any, i: number) => {
              const key = customFieldKey(f.name)
              const id = `checkout-custom-${i}`
              return (
                <div key={i}>
                  {f.type === 'multiselect' ? (
                    <fieldset id={id} tabIndex={-1} className="outline-none" aria-describedby={describedBy(key, id)}>
                      <legend className={labelClass}>{f.label}{f.required && <span className="text-red-500"> *</span>}</legend>
                      <div className="space-y-1.5">
                        {(f.options || []).map((opt: string) => {
                          const val = fieldValues[f.name]
                          const checked = Array.isArray(val) && val.includes(opt)
                          return (
                            <label key={opt} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${theme.panel}`}>
                              <input type="checkbox" checked={checked}
                                onChange={() => { toggleMultiselect(f.name, opt); clearError(key) }}
                                className="h-4 w-4 rounded" />
                              {opt}
                            </label>
                          )
                        })}
                      </div>
                    </fieldset>
                  ) : (
                    <>
                      <label htmlFor={id} className={labelClass}>{f.label}{f.required && <span className="text-red-500"> *</span>}</label>
                      <input id={id} type={f.type} value={fieldValues[f.name] as string || ''}
                        onChange={e => { setFieldValues({ ...fieldValues, [f.name]: e.target.value }); clearError(key) }}
                        aria-invalid={Boolean(fieldErrors[key])} aria-describedby={describedBy(key, id)}
                        className={inputClass} />
                    </>
                  )}
                  {fieldErrors[key] && <p id={`${id}-error`} role="alert" className={errorClass}>{fieldErrors[key]}</p>}
                </div>
              )
            })}

            {showOptional || customerEmail || customerNote ? (
              <>
                <div>
                  <label htmlFor="checkout-email" className={labelClass}>Email <span className={`font-normal ${theme.subtle}`}>(optional)</span></label>
                  <input id="checkout-email" type="email" autoComplete="email" value={customerEmail}
                    onChange={e => setCustomerEmail(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="checkout-note" className={labelClass}>Note <span className={`font-normal ${theme.subtle}`}>(optional)</span></label>
                  <textarea id="checkout-note" value={customerNote} onChange={e => setCustomerNote(e.target.value)} rows={2}
                    className={inputClass} />
                </div>
              </>
            ) : (
              <button type="button" onClick={() => setShowOptional(true)} className={`text-sm font-semibold underline ${theme.muted}`}>
                + Add email or note (optional)
              </button>
            )}
          </div>
        </div>

        {error && <p role="alert" className={`mt-4 text-sm ${theme.error}`}>{error}</p>}

        {/* On phones the pay button stays in reach at the bottom of the screen. */}
        <div className={`sticky bottom-0 -mx-6 mt-6 border-t px-6 pb-4 pt-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 ${theme.footer}`}>
          <button onClick={handleProceed} disabled={starting}
            className={`w-full py-3.5 text-base font-bold text-white disabled:opacity-60 ${btnRadius}`}
            style={{ backgroundColor: primaryColor }}>
            {starting ? 'Please wait…' : displayAmount > 0 ? `${ctaText} · ${formatAmount(displayAmount)}` : ctaText}
          </button>
        </div>

        {trustLine}
      </div>
    </div>
  )
}
