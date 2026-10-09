'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Heart } from 'lucide-react'

const UPI_ID = '9172632189@kotakbank'
// "Don't show again" (the same key as the old popup, so earlier choices still count).
const DISMISSED_KEY = 'toropay_donation_dismissed'
// "Maybe later": hidden until this time (milliseconds).
const SNOOZED_UNTIL_KEY = 'toropay_donation_snoozed_until'
const MIN_PAID_PAYMENTS = 3
export const SNOOZE_DAYS = 30

/** After a few paid payments, unless "Don't show again", or "Maybe later" in the last 30 days. */
export function shouldShowDonation(paidCount: number, dismissed: string | null, snoozedUntil: string | null, now = Date.now()): boolean {
  if (paidCount < MIN_PAID_PAYMENTS || dismissed === 'true') return false
  const until = Number(snoozedUntil)
  return !(Number.isFinite(until) && until > now)
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage blocked (private window): the card simply shows again next time.
  }
}

/** A small "Support ToroPay" card on Overview (U15), in the page, never over menus or forms. */
export function DonationCard({ paidCount }: { paidCount: number }) {
  const router = useRouter()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(shouldShowDonation(paidCount, read(DISMISSED_KEY), read(SNOOZED_UNTIL_KEY)))
  }, [paidCount])

  function later() {
    write(SNOOZED_UNTIL_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60_000))
    setVisible(false)
  }

  function never() {
    write(DISMISSED_KEY, 'true')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <section aria-labelledby="donation-title" className="relative mt-8 rounded-2xl border border-gray-100 bg-white p-5">
      <button type="button" onClick={later} aria-label="Hide for now" className="absolute right-3 top-3 text-gray-500 hover:text-gray-600">
        <X className="h-4 w-4" />
      </button>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pr-6">
        <div className="flex min-w-[14rem] flex-1 items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50">
            <Heart className="h-4 w-4 text-primary-500" aria-hidden />
          </div>
          <div>
            <h2 id="donation-title" className="text-sm font-bold text-charcoal">Support ToroPay</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              You&apos;ve received a few payments, thank you! If ToroPay helps your business, a small donation keeps it free.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-gray-500">{UPI_ID}</span>
          {[10, 50, 100].map(amount => (
            <button key={amount} type="button" onClick={() => { later(); router.push(`/dashboard/support?amount=${amount}`) }}
              className="rounded-lg bg-charcoal px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90">
              ₹{amount}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex gap-4 text-xs">
        <button type="button" onClick={later} className="text-gray-500 hover:text-charcoal">Maybe later</button>
        <button type="button" onClick={never} className="text-gray-500 underline hover:text-gray-600">Don&apos;t show again</button>
      </div>
    </section>
  )
}
