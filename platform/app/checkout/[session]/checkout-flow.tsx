'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buttonRadius } from '@/lib/utils'
import { UPI_APPS } from '@/lib/constants'
import { buildAppDeepLink, buildUpiIntentUrl, buildUpiPayUrl } from '@/lib/upi'
import OrderSummary from '@/components/checkout/order-summary'

export interface CheckoutView {
  payment: {
    checkout_session_id: string
    payment_reference: string
    status: string
    amount: number
    currency: string
    provider: string
    mode: string
    expires_at: string | null
    paid_at: string | null
    payment_method: string | null
  }
  order: {
    id: string
    order_number: string
    subtotal_amount: number
    discount_amount: number
    shipping_amount: number
    tax_amount: number
    total_amount: number
    currency: string
    customer_name: string | null
    customer_email: string | null
    customer_phone: string | null
    items: Array<{ name: string; sku: string | null; quantity: number; unit_price: number; line_total: number }>
  }
  merchant: {
    id: string
    business_name: string
    business_logo_url: string | null
    bg_image_url: string | null
    brand_color_primary: string
    brand_color_secondary: string
    brand_font: string
    button_style: string
    page_theme: string
    support_email: string | null
    support_phone: string | null
    custom_message: string | null
    upi_id: string | null
  }
}

interface Props {
  view: CheckoutView
}

type Step = 'form' | 'pay' | 'done'

export default function CheckoutFlow({ view }: Props) {
  const router = useRouter()
  const { payment, order, merchant } = view

  const [step, setStep] = useState<Step>('form')
  const [name, setName] = useState(order.customer_name ?? '')
  const [email, setEmail] = useState(order.customer_email ?? '')
  const [phone, setPhone] = useState(order.customer_phone ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [payResult, setPayResult] = useState<{ status: string; flagged?: boolean; reason?: string } | null>(null)

  const primaryColor = merchant.brand_color_primary || '#7bb86c'
  const secondaryColor = merchant.brand_color_secondary || '#2c2c2c'
  const btnRadius = buttonRadius(merchant.button_style || 'rounded')
  const isDark = merchant.page_theme === 'dark'
  const bg = merchant.bg_image_url ? 'bg-cover bg-center bg-no-repeat' : isDark ? 'bg-gray-900 text-white' : 'bg-cream text-charcoal'
  const bgStyle = merchant.bg_image_url ? { backgroundImage: `url(${merchant.bg_image_url})` } : undefined
  const cardBg = isDark ? 'bg-black/30 border-white/10 shadow-2xl shadow-black/30' : 'bg-white/30 border-white/40 shadow-2xl shadow-black/10'
  const inputBg = isDark
    ? 'bg-white/10 border-white/10 text-white placeholder:text-white/40 focus:border-white/30'
    : 'bg-white/50 border-white/60 text-charcoal placeholder:text-gray-500 focus:border-white/80'

  const lockedIn = payment.status === 'paid'

  function formatAmount(n: number) {
    return `${payment.currency === 'INR' ? '₹' : ''}${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
  }

  function validate() {
    const trimmedName = name.trim()
    if (!trimmedName) return 'Name is required'
    if (trimmedName.length < 2) return 'Name must be at least 2 characters'
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address'
    return null
  }

  async function beginPayment() {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setError('')
    setBusy(true)
    try {
      const res = await fetch(`/api/checkout/${payment.checkout_session_id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          method: payment.provider === 'upi' ? 'upi' : 'mock',
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error || 'Could not start payment')
        setBusy(false)
        return
      }
      const data = (await res.json()) as { checkout_url: string; status: string; provider: string }
      setStep('pay')
      if (data.status === 'paid') {
        router.push(`/checkout/${payment.checkout_session_id}/success`)
        return
      }
      if (data.provider !== 'mock' && data.provider !== 'upi') {
        window.location.href = data.checkout_url
        return
      }
      setBusy(false)
    } catch {
      setError('Network error — please try again')
      setBusy(false)
    }
  }

  async function simulatePay() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/checkout/${payment.checkout_session_id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'mock' }),
      })
      const data = (await res.json()) as { status: string; flagged?: boolean; reason?: string }
      setPayResult(data)
      if (data.flagged) {
        setError(data.reason || 'Payment flagged for review — contact support')
      }
      if (!data.flagged && data.status === 'paid') {
        setStep('done')
        router.push(`/checkout/${payment.checkout_session_id}/success`)
        return
      }
      setBusy(false)
    } catch {
      setError('Network error — please retry')
      setBusy(false)
    }
  }

  function openUpi(appName?: string) {
    const vpa = merchant.upi_id || ''
    const note = `Order ${order.order_number}`
    const txnId = payment.payment_reference
    if (appName) {
      const app = UPI_APPS.find(a => a.name === appName)
      if (app) {
        window.location.href = buildAppDeepLink(app, vpa, payment.amount, txnId, note)
        return
      }
    }
    const isAndroid = /android/i.test(navigator.userAgent)
    if (isAndroid && /chrome/i.test(navigator.userAgent)) {
      window.location.href = buildUpiIntentUrl(vpa, payment.amount, txnId, note)
    } else {
      window.location.href = buildUpiPayUrl(vpa, payment.amount, txnId, note)
    }
  }

  async function upiMarkedSent() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/checkout/${payment.checkout_session_id}/upi-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = (await res.json()) as { status: string; error?: string }
      if (!res.ok) {
        setError(data.error || 'Could not update payment')
        setBusy(false)
        return
      }
      if (data.status === 'paid') {
        router.push(`/checkout/${payment.checkout_session_id}/success`)
        return
      }
      setPayResult({ status: data.status })
      setBusy(false)
    } catch {
      setError('Network error — please retry')
      setBusy(false)
    }
  }

  function goToSuccess() {
    router.push(`/checkout/${payment.checkout_session_id}/success`)
  }
  function goToCancel() {
    router.push(`/checkout/${payment.checkout_session_id}/cancel`)
  }

  if (lockedIn) {
    return (
      <div className={`flex min-h-screen items-center justify-center ${bg} p-4`} style={bgStyle}>
        <div className={`w-full max-w-md rounded-3xl border p-8 backdrop-blur-xl ${cardBg}`}>
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/90 text-2xl">✓</div>
            <h1 className="text-xl font-bold" style={{ color: secondaryColor }}>Payment confirmed</h1>
            <p className="mt-2 text-sm opacity-70">Your payment for order {order.order_number} was successful.</p>
            <button onClick={goToSuccess} className={`mt-6 w-full py-3 font-bold text-white ${btnRadius}`} style={{ backgroundColor: primaryColor }}>
              View receipt
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'pay' && payment.provider === 'upi') {
    const vpa = merchant.upi_id || ''
    const note = `Order ${order.order_number}`
    const txnId = payment.payment_reference
    const qrSrc = `/api/qr?vpa=${encodeURIComponent(vpa)}&amount=${payment.amount}&txn_id=${encodeURIComponent(txnId)}&note=${encodeURIComponent(note)}`
    const markedSent = payResult?.status === 'processing' || payResult?.status === 'pending'
    return (
      <div className={`flex min-h-screen items-center justify-center ${bg} p-4`} style={bgStyle}>
        <div className={`w-full max-w-md rounded-3xl border p-8 backdrop-blur-xl ${cardBg}`}>
          <div className="mb-6 text-center">
            {merchant.business_logo_url && (
              <img src={merchant.business_logo_url} className="mx-auto mb-3 h-12 object-contain" alt="" />
            )}
            <div className="text-4xl font-bold tracking-tight" style={{ color: secondaryColor }}>
              {formatAmount(payment.amount)}
            </div>
            <p className="mt-1 text-sm opacity-70">{merchant.business_name}</p>
            <p className="mt-1 font-mono text-xs opacity-50">{payment.payment_reference}</p>
          </div>

          {markedSent ? (
            <div className="mb-6 rounded-xl bg-amber-50 p-4 text-center text-sm text-amber-800">
              Payment marked as sent. Waiting for merchant confirmation.
              <button onClick={upiMarkedSent} disabled={busy}
                className={`mt-3 w-full py-2.5 text-sm font-bold text-white ${btnRadius} disabled:opacity-60`}
                style={{ backgroundColor: primaryColor }}>
                {busy ? 'Checking…' : 'I&apos;ve completed payment'}
              </button>
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
                Pay with UPI — {formatAmount(payment.amount)}
              </button>

              <div className="mb-4 grid grid-cols-3 gap-2">
                {UPI_APPS.map(app => (
                  <button key={app.name} onClick={() => openUpi(app.name)}
                    className={`border border-white/20 bg-white/20 py-2 text-xs font-semibold backdrop-blur-md transition-all hover:bg-white/40 ${btnRadius}`}>
                    {app.name.split(' ')[0]}
                  </button>
                ))}
              </div>

              <button onClick={upiMarkedSent} disabled={busy}
                className={`mb-2 w-full border border-white/20 bg-white/20 py-2.5 text-sm font-semibold backdrop-blur-md transition-all hover:bg-white/40 ${btnRadius} disabled:opacity-50`}>
                {busy ? 'Updating...' : "I've completed payment"}
              </button>
            </>
          )}

          <p className="mt-4 text-center text-xs opacity-50">
            Pay to <span className="font-mono">{vpa}</span>
          </p>
        </div>
      </div>
    )
  }

  if (step === 'pay') {
    return (
      <div className={`flex min-h-screen items-center justify-center ${bg} p-4`} style={bgStyle}>
        <div className={`w-full max-w-md rounded-3xl border p-8 backdrop-blur-xl ${cardBg}`}>
          <div className="mb-6 text-center">
            {merchant.business_logo_url && (
              <img src={merchant.business_logo_url} className="mx-auto mb-3 h-12 object-contain" alt="" />
            )}
            <div className="text-4xl font-bold tracking-tight" style={{ color: secondaryColor }}>
              {formatAmount(payment.amount)}
            </div>
            <p className="mt-1 text-sm opacity-70">{merchant.business_name}</p>
            <p className="mt-1 font-mono text-xs opacity-50">{payment.payment_reference}</p>
          </div>

          {payment.mode === 'test' && (
            <div className="mb-4 rounded-xl border border-amber-300/40 bg-amber-500/10 p-3 text-center text-xs font-semibold text-amber-600">
              TEST MODE — no real money moves
            </div>
          )}

          {payResult?.status === 'paid' ? (
            <div className="mb-4 rounded-xl bg-green-50 p-4 text-center text-sm text-green-800">
              Payment successful! Redirecting…
            </div>
          ) : (
            <>
              <p className="mb-4 text-center text-sm opacity-70">
                This is a simulated gateway for the {payment.provider} provider.
              </p>
              <button onClick={simulatePay} disabled={busy}
                className={`w-full py-3.5 text-base font-bold text-white ${btnRadius} disabled:opacity-60`}
                style={{ backgroundColor: primaryColor }}>
                {busy ? 'Processing…' : `Pay ${formatAmount(payment.amount)}`}
              </button>
              <button onClick={goToCancel} className={`mt-2 w-full py-2.5 text-sm font-semibold opacity-60 transition-opacity hover:opacity-90`}>
                Cancel
              </button>
            </>
          )}
          <p className="mt-4 text-center text-xs opacity-50">Secured by ToroPay</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex min-h-screen items-center justify-center ${bg} p-4`} style={bgStyle}>
      <div className={`w-full max-w-md rounded-3xl border p-8 backdrop-blur-xl ${cardBg}`}>
        <div className="mb-6 text-center">
          {merchant.business_logo_url && (
            <img src={merchant.business_logo_url} className="mx-auto mb-3 h-12 object-contain" alt="" />
          )}
          <h1 className="text-xl font-bold" style={{ color: secondaryColor }}>{merchant.business_name}</h1>
          {merchant.custom_message && <p className="mt-1 text-sm opacity-70">{merchant.custom_message}</p>}
          <p className="mt-1 font-mono text-xs opacity-50">Order {order.order_number}</p>
        </div>

        <div className="mb-4">
          <OrderSummary
            items={order.items}
            subtotal={order.subtotal_amount}
            discount={order.discount_amount}
            shipping={order.shipping_amount}
            tax={order.tax_amount}
            total={order.total_amount}
            currency={payment.currency}
            isDark={isDark}
            verified
          />
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="checkout-name" className="mb-1 block text-xs font-semibold opacity-70">Your Name <span className="text-red-400">*</span></label>
            <input id="checkout-name" value={name} onChange={e => setName(e.target.value)}
              className={`w-full rounded-xl border px-4 py-3 text-sm outline-none backdrop-blur-md transition-all focus:ring-2 focus:ring-white/30 ${inputBg}`} />
          </div>
          <div>
            <label htmlFor="checkout-phone" className="mb-1 block text-xs font-semibold opacity-70">Phone</label>
            <input id="checkout-phone" value={phone} onChange={e => setPhone(e.target.value)}
              className={`w-full rounded-xl border px-4 py-3 text-sm outline-none backdrop-blur-md transition-all focus:ring-2 focus:ring-white/30 ${inputBg}`} />
          </div>
          <div>
            <label htmlFor="checkout-email" className="mb-1 block text-xs font-semibold opacity-70">Email</label>
            <input id="checkout-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
              className={`w-full rounded-xl border px-4 py-3 text-sm outline-none backdrop-blur-md transition-all focus:ring-2 focus:ring-white/30 ${inputBg}`} />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <button onClick={beginPayment} disabled={busy}
          className={`mt-6 w-full py-3.5 text-base font-bold text-white ${btnRadius} disabled:opacity-60`}
          style={{ backgroundColor: primaryColor }}>
          {busy ? 'Preparing payment…' : `Continue to Pay ${formatAmount(order.total_amount)}`}
        </button>

        <p className="mt-4 text-center text-[13px] opacity-70">Powered by ToroPay</p>
      </div>
    </div>
  )
}