'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UPI_APPS } from '@/lib/constants'
import { buildAppDeepLink, buildUpiIntentUrl, buildUpiPayUrl } from '@/lib/upi'
import { buttonRadius, formatAmount, generateTxnId } from '@/lib/utils'
import { isValidRedirectUrl } from '@/lib/validate-url'

interface CheckoutData {
  link: {
    id: string
    merchant_id: string
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
}

export default function CheckoutClient({ data }: Props) {
  const router = useRouter()
  const link = data.link
  const merchant = data.merchant

  const [amount, setAmount] = useState(link.amount ? Number(link.amount) : 0)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerNote, setCustomerNote] = useState('')
  const [fieldValues, setFieldValues] = useState<Record<string, string | string[]>>({})
  const [step, setStep] = useState<'form' | 'pay'>('form')
  const [txnId, setTxnId] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<string>('initiated')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [confirming, setConfirming] = useState(false)
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set())

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

  useEffect(() => {
    if (!txnId || step !== 'pay') return
    const interval = setInterval(async () => {
      const res = await fetch(`/api/transactions?txn_id=${txnId}`)
      if (!res.ok) return
      const txn = await res.json()
      if (txn.status === 'success') {
        setPaymentStatus('success')
        clearInterval(interval)
        if (link.redirect_url && isValidRedirectUrl(link.redirect_url)) {
          window.location.href = link.redirect_url
        } else {
          router.push(`/pay/${link.slug}/success?txn=${txnId}`)
        }
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [txnId, step, link, router])

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
    const nameErr = validateName(customerName)
    if (nameErr) { setError(nameErr); return }
    const phoneErr = validatePhone(customerPhone)
    if (phoneErr) { setError(phoneErr); return }
    if (hasProducts && selectedProducts.size === 0) {
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
    setTxnId(id)
    if (hasProducts) setAmount(payAmount)
    setStep('pay')
    setError('')

    await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_id: link.merchant_id,
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
          ...(hasProducts && selectedProducts.size > 0 ? {
            _selected_products: Array.from(selectedProducts).map(i => ({
              name: productItems[i]?.name || `Item ${i + 1}`,
              price: productItems[i]?.price || '0',
              category: productItems[i]?.category || '',
            }))
          } : {}),
        },
      }),
    }).catch(() => {})
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
    setConfirming(true)
    await fetch(`/api/transactions/${txnId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'pending' }),
    })
    setPaymentStatus('pending')
    setConfirming(false)
    setError('')
  }

  async function merchantConfirmSuccess() {
    setConfirming(true)
    const res = await fetch(`/api/transactions/${txnId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'success', merchant_action: true }),
    })
    const data = await res.json()
    setConfirming(false)
    if (data.redirect_url && isValidRedirectUrl(data.redirect_url)) window.location.href = data.redirect_url
    else router.push(`/pay/${link.slug}/success?txn=${txnId}`)
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

          <button onClick={markAsPaid} disabled={confirming || paymentStatus === 'pending'}
            className={`mb-2 w-full border border-white/20 bg-white/20 py-2.5 text-sm font-semibold backdrop-blur-md transition-all hover:bg-white/40 ${btnRadius} disabled:opacity-50`}>
            {confirming ? 'Updating...' : "I've completed payment"}
          </button>

          <details className="mt-2">
            <summary className="cursor-pointer text-center text-xs opacity-50">Merchant: confirm payment manually</summary>
            <button onClick={merchantConfirmSuccess} disabled={confirming}
              className={`mt-2 w-full bg-green-600 py-2 text-xs font-semibold text-white ${btnRadius}`}>
              Mark as successful (demo)
            </button>
          </details>

          <p className="mt-4 text-center text-xs opacity-50">
            Pay to <span className="font-mono">{link.upi_id}</span>
          </p>
        </div>
      </div>
    )
  }

  const allFields = (link.custom_fields || []) as any[]
  const customFields = allFields.filter((f: any) => f._type !== 'products')
  const productItems = allFields.find((f: any) => f._type === 'products')?.items || []

  const productSubtotal = Array.from(selectedProducts).reduce((sum, i) => {
    const price = parseFloat(productItems[i]?.price)
    return sum + (isNaN(price) ? 0 : price)
  }, 0)
  const hasProducts = productItems.length > 0
  const displayAmount = hasProducts && selectedProducts.size > 0 ? productSubtotal : (hasProducts ? 0 : amount)

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
              {productItems.map((p: any, i: number) => {
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
              })}
              {selectedProducts.size > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-white/30 bg-white/20 p-3 backdrop-blur-sm">
                  <span className="text-xs font-semibold opacity-70">Subtotal ({selectedProducts.size} item{selectedProducts.size > 1 ? 's' : ''})</span>
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

        <button onClick={handleProceed}
          className={`mt-6 w-full py-3.5 text-base font-bold text-white ${btnRadius}`}
          style={{ backgroundColor: primaryColor }}>
          {ctaText}
        </button>

        <p className="mt-4 text-center text-xs opacity-50">Powered by ToroPay</p>
      </div>
    </div>
  )
}
