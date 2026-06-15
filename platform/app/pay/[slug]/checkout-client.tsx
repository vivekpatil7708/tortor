'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UPI_APPS } from '@/lib/constants'
import { buildAppDeepLink, buildUpiIntentUrl, buildUpiPayUrl } from '@/lib/upi'
import { buttonRadius, formatAmount, generateTxnId } from '@/lib/utils'

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
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [step, setStep] = useState<'form' | 'pay'>('form')
  const [txnId, setTxnId] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<string>('initiated')
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  const primaryColor = merchant.brand_color_primary || '#7bb86c'
  const secondaryColor = merchant.brand_color_secondary || '#2c2c2c'
  const btnRadius = buttonRadius(merchant.button_style || 'rounded')
  const isDark = merchant.page_theme === 'dark'
  const bg = isDark ? 'bg-gray-900 text-white' : 'bg-cream text-charcoal'
  const cardBg = isDark ? 'bg-white/10 border-white/20' : 'bg-white/60 border-white/80'
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
        if (link.redirect_url) {
          window.location.href = link.redirect_url
        } else {
          router.push(`/pay/${link.slug}/success?txn=${txnId}`)
        }
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [txnId, step, link, router])

  async function handleProceed() {
    if (!customerName.trim()) { setError('Name is required'); return }
    if (!customerPhone.trim()) { setError('Phone is required'); return }
    if (link.amount_flexible && amount < (link.min_amount || 1)) {
      setError(`Minimum amount is ₹${link.min_amount || 1}`)
      return
    }
    if (link.amount_flexible && link.max_amount && amount > link.max_amount) {
      setError(`Maximum amount is ₹${link.max_amount}`)
      return
    }

    const id = generateTxnId()
    setTxnId(id)
    setStep('pay')
    setError('')

    await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_id: link.merchant_id,
        payment_link_id: link.id,
        txn_id: id,
        amount,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail || null,
        customer_note: customerNote || null,
        custom_field_values: fieldValues,
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
    if (data.redirect_url) window.location.href = data.redirect_url
    else router.push(`/pay/${link.slug}/success?txn=${txnId}`)
  }

  const qrSrc = `/api/qr?vpa=${encodeURIComponent(link.upi_id)}&amount=${amount}&txn_id=${encodeURIComponent(txnId)}&note=${encodeURIComponent(link.title)}`

  if (step === 'pay') {
    return (
      <div className={`flex min-h-screen items-center justify-center ${bg} p-4`}>
        <div className={`w-full max-w-md rounded-3xl border p-8 backdrop-blur-md ${cardBg}`}>
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
                    className={`border border-gray-200 bg-white/80 py-2 text-xs font-semibold text-charcoal hover:bg-white ${btnRadius}`}>
                    {app.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            </>
          )}

          <button onClick={markAsPaid} disabled={confirming || paymentStatus === 'pending'}
            className={`mb-2 w-full border border-gray-200 bg-white/80 py-2.5 text-sm font-semibold text-charcoal ${btnRadius} disabled:opacity-50`}>
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

  const customFields = link.custom_fields || []

  return (
    <div className={`flex min-h-screen items-center justify-center ${bg} p-4`}>
      <div className={`w-full max-w-sm rounded-3xl border p-8 backdrop-blur-md ${cardBg}`}>
        <div className="mb-6 text-center">
          {merchant.business_logo_url && (
            <img src={merchant.business_logo_url} className="mx-auto mb-3 h-12 object-contain" alt="" />
          )}
          <h1 className="text-xl font-bold" style={{ color: secondaryColor }}>{link.title}</h1>
          {link.description && <p className="mt-1 text-sm opacity-70">{link.description}</p>}
        </div>

        <div className="space-y-4">
          {link.amount_flexible ? (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Amount (₹)</label>
              <input type="number" value={amount || ''} onChange={e => setAmount(Number(e.target.value))} required
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary-500" />
            </div>
          ) : (
            <div className="text-center">
              <div className="text-4xl font-bold tracking-tight" style={{ color: secondaryColor }}>
                {formatAmount(amount)}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Your Name *</label>
            <input value={customerName} onChange={e => setCustomerName(e.target.value)} required
              className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Phone *</label>
            <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} required
              className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Email</label>
            <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Note</label>
            <textarea value={customerNote} onChange={e => setCustomerNote(e.target.value)} rows={2}
              className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary-500" />
          </div>

          {(link.custom_fields || []).map((f, i) => (
            <div key={i}>
              <label className="mb-1 block text-xs font-semibold text-gray-500">{f.label}{f.required ? ' *' : ''}</label>
              <input type={f.type} value={fieldValues[f.name] || ''}
                onChange={e => setFieldValues({ ...fieldValues, [f.name]: e.target.value })} required={f.required}
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary-500" />
            </div>
          ))}
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <button onClick={handleProceed}
          className={`mt-6 w-full py-3.5 text-base font-bold text-white ${btnRadius}`}
          style={{ backgroundColor: primaryColor }}>
          {ctaText}
        </button>

        <p className="mt-4 text-center text-xs opacity-40">Powered by ToroPay</p>
      </div>
    </div>
  )
}
