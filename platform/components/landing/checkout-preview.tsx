'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Check } from 'lucide-react'

const DEMO_CHECKOUT = '/pay/demo-booking'

function formatRupees(raw: string) {
  const amount = Number(raw)
  if (!Number.isFinite(amount) || amount <= 0) return '₹0'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function CheckoutPreview() {
  const [business, setBusiness] = useState('Demo Store')
  const [amount, setAmount] = useState('1299')
  const businessId = useId()
  const amountId = useId()

  return (
    <div className="rounded-2xl border border-olive-leaf-800 bg-cornsilk-700 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-black-forest">Checkout preview</p>
        <span className="text-sm text-olive-leaf">No signup needed</span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={businessId} className="text-sm font-medium text-olive-leaf">
            Business name
          </label>
          <input
            id={businessId}
            value={business}
            onChange={event => setBusiness(event.target.value)}
            maxLength={28}
            className="mt-1 w-full rounded-lg border border-olive-leaf-700 bg-cornsilk-800 px-3 py-2 text-base text-black-forest outline-none focus:border-copperwood focus:ring-2 focus:ring-copperwood/20"
          />
        </div>
        <div>
          <label htmlFor={amountId} className="text-sm font-medium text-olive-leaf">
            Amount (₹)
          </label>
          <input
            id={amountId}
            type="number"
            min="1"
            max="1000000"
            inputMode="numeric"
            value={amount}
            onChange={event => setAmount(event.target.value)}
            className="mt-1 w-full rounded-lg border border-olive-leaf-700 bg-cornsilk-800 px-3 py-2 text-base text-black-forest outline-none focus:border-copperwood focus:ring-2 focus:ring-copperwood/20"
          />
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-cornsilk-600 p-4">
        <div className="mx-auto max-w-[17rem] rounded-2xl border border-olive-leaf-800 bg-cornsilk-800 p-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-olive-leaf text-sm font-bold text-cornsilk">
              {(business.trim().charAt(0) || 'T').toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-black-forest">{business.trim() || 'Your business'}</p>
              <p className="text-sm text-olive-leaf">Payment link</p>
            </div>
          </div>

          <p className="mt-5 text-sm text-olive-leaf">Amount to pay</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-black-forest" aria-live="polite">
            {formatRupees(amount)}
          </p>

          <Link
            href={DEMO_CHECKOUT}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center justify-center gap-1.5 rounded-lg border border-copperwood bg-cornsilk-800 px-4 py-2.5 text-sm font-semibold text-black-forest hover:bg-black-forest hover:text-cornsilk"
          >
            Open live checkout <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>

          <div className="mt-3 flex items-center justify-center gap-1.5 text-sm text-olive-leaf">
            <Check className="h-4 w-4 text-copperwood" aria-hidden /> Paid directly to your UPI ID
          </div>
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-olive-leaf">
        This preview runs in your browser; nothing is saved. The live demo opens a sample checkout in a new tab, and no
        payment is taken.
      </p>
    </div>
  )
}
