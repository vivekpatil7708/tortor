'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { buttonRadius } from '@/lib/utils'
import OrderSummary from '@/components/checkout/order-summary'

interface PaylinkView {
  link: {
    title: string
    description: string | null
    mode: 'test' | 'live'
    amount: number | null
    amount_flexible: boolean
    min_amount: number | null
    max_amount: number | null
    items: Array<{ product_id: string | null; name: string; sku: string | null; quantity: number; unit_price: number; line_total: number }>
    items_total: number
    collect_name: boolean
    collect_phone: boolean
    collect_email: boolean
    custom_message: string | null
  }
  merchant: {
    business_name: string
    business_logo_url: string | null
    bg_image_url: string | null
    brand_color_primary: string
    brand_color_secondary: string
    button_style: string
    page_theme: string
    custom_message: string | null
  }
}

interface Props {
  view: PaylinkView
  slug: string
}

export default function PaylinkClient({ view, slug }: Props) {
  const router = useRouter()
  const { link, merchant } = view

  const [amount, setAmount] = useState<number | ''>(link.amount ?? '')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const primaryColor = merchant.brand_color_primary || '#7bb86c'
  const secondaryColor = merchant.brand_color_secondary || '#2c2c2c'
  const btnRadius = buttonRadius(merchant.button_style || 'rounded')
  const isDark = merchant.page_theme === 'dark'
  const bg = merchant.bg_image_url ? 'bg-cover bg-center bg-no-repeat' : isDark ? 'bg-gray-900 text-white' : 'bg-cream text-charcoal'
  const bgStyle = merchant.bg_image_url ? { backgroundImage: `url(${merchant.bg_image_url})` } : undefined
  const cardBg = isDark ? 'bg-black/30 border-white/10 shadow-2xl shadow-black/30' : 'bg-white/40 border-white/60 shadow-2xl shadow-black/10'
  const inputBg = isDark
    ? 'bg-white/10 border-white/10 text-white placeholder:text-white/40 focus:border-white/30'
    : 'bg-white/60 border-white/80 text-charcoal placeholder:text-gray-400 focus:border-white/90'

  const displayAmount = typeof amount === 'number' ? amount : link.items_total || 0
  const hasItems = link.items.length > 0

  function validate() {
    if (!hasItems && link.amount_flexible) {
      if (typeof amount !== 'number' || amount <= 0) return 'Enter an amount'
      if (link.min_amount !== null && amount < link.min_amount) return `Minimum amount is ₹${link.min_amount}`
      if (link.max_amount !== null && amount > link.max_amount) return `Maximum amount is ₹${link.max_amount}`
    }
    if (link.collect_name && name.trim().length < 2) return 'Name is required'
    if (link.collect_email && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email'
    return null
  }

  async function pay() {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setError('')
    setBusy(true)
    try {
      const res = await fetch(`/api/paylink/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          amount: hasItems ? null : typeof amount === 'number' ? amount : null,
        }),
      })
      const data = (await res.json()) as { error?: string; checkout_session_id?: string; checkout_url?: string }
      if (!res.ok || !data.checkout_session_id) {
        setError(data.error || 'Could not start checkout')
        setBusy(false)
        return
      }
      router.push(`/checkout/${data.checkout_session_id}`)
    } catch {
      setError('Network error — please retry')
      setBusy(false)
    }
  }

  return (
    <div className={`flex min-h-screen items-center justify-center ${bg} p-4`} style={bgStyle}>
      <div className={`w-full max-w-md rounded-3xl border p-8 backdrop-blur-xl ${cardBg}`}>
        <div className="mb-6 text-center">
          {merchant.business_logo_url && (
            <img src={merchant.business_logo_url} className="mx-auto mb-3 h-12 object-contain" alt="" />
          )}
          <h1 className="text-xl font-bold" style={{ color: secondaryColor }}>{link.title}</h1>
          {link.description && <p className="mt-1 text-sm opacity-70">{link.description}</p>}
          {link.custom_message && <p className="mt-1 text-sm opacity-60">{link.custom_message}</p>}
        </div>

        {link.mode === 'test' && (
          <div className="mb-4 rounded-xl border border-amber-300/40 bg-amber-500/10 p-3 text-center text-xs font-semibold text-amber-600">
            TEST MODE — no real money moves
          </div>
        )}

        <div className="space-y-4">
          {hasItems ? (
            <div className="text-left">
              <OrderSummary
                items={link.items}
                subtotal={link.items.reduce((sum, it) => sum + it.line_total, 0)}
                total={link.items_total}
                currency="INR"
                isDark={isDark}
                verified
              />
            </div>
          ) : link.amount_flexible ? (
            <div>
              <label className="mb-1 block text-xs font-semibold opacity-70">Amount (₹) <span className="text-red-400">*</span></label>
              <input type="number" value={amount === '' ? '' : amount} onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                className={`w-full rounded-xl border px-4 py-3 text-sm outline-none backdrop-blur-md transition-all focus:ring-2 focus:ring-white/30 ${inputBg}`} />
            </div>
          ) : (
            <div className="text-center">
              <div className="text-4xl font-bold tracking-tight" style={{ color: secondaryColor }}>
                ₹{(displayAmount || 0).toLocaleString('en-IN')}
              </div>
            </div>
          )}

          {link.collect_name && (
            <div>
              <label className="mb-1 block text-xs font-semibold opacity-70">Your Name <span className="text-red-400">*</span></label>
              <input value={name} onChange={e => setName(e.target.value)} className={`w-full rounded-xl border px-4 py-3 text-sm outline-none backdrop-blur-md transition-all focus:ring-2 focus:ring-white/30 ${inputBg}`} />
            </div>
          )}
          {link.collect_phone && (
            <div>
              <label className="mb-1 block text-xs font-semibold opacity-70">Phone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} className={`w-full rounded-xl border px-4 py-3 text-sm outline-none backdrop-blur-md transition-all focus:ring-2 focus:ring-white/30 ${inputBg}`} />
            </div>
          )}
          {link.collect_email && (
            <div>
              <label className="mb-1 block text-xs font-semibold opacity-70">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={`w-full rounded-xl border px-4 py-3 text-sm outline-none backdrop-blur-md transition-all focus:ring-2 focus:ring-white/30 ${inputBg}`} />
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <button onClick={pay} disabled={busy}
          className={`mt-6 w-full py-3.5 text-base font-bold text-white ${btnRadius} disabled:opacity-60`}
          style={{ backgroundColor: primaryColor }}>
          {busy ? 'Preparing checkout…' : `Pay ₹${(displayAmount || 0).toLocaleString('en-IN')}`}
        </button>

        <p className="mt-4 text-center text-xs opacity-50">Powered by ToroPay</p>
      </div>
    </div>
  )
}