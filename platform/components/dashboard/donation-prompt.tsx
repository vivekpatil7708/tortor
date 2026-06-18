'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Heart } from 'lucide-react'

const UPI_ID = '9172632189@kotakbank'
const STORAGE_KEY = 'toropay_donation_dismissed'
const THRESHOLD = 3

export function DonationPrompt() {
  const router = useRouter()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY)
    if (dismissed === 'true') return

    fetch('/api/analytics').then(r => r.json()).then(d => {
      const successCount = d.by_status?.success || 0
      if (successCount >= THRESHOLD) {
        setVisible(true)
      }
    }).catch(() => {})
  }, [])

  function dismiss(permanent = false) {
    setVisible(false)
    if (permanent) {
      localStorage.setItem(STORAGE_KEY, 'true')
    }
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80">
      <div className="relative rounded-2xl border border-gray-100 bg-white p-5 shadow-2xl">
        <button onClick={() => dismiss(false)}
          className="absolute right-3 top-3 text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>

        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-50">
            <Heart className="h-4 w-4 text-primary-500" />
          </div>
          <p className="text-sm font-bold text-charcoal">Support ToroPay</p>
        </div>

        <p className="mb-3 text-xs leading-relaxed text-gray-500">
          You've received a few payments — thank you! If ToroPay helps your business,
          consider donating to keep it free forever.
        </p>

        <div className="mb-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
          <p className="text-center font-mono text-sm font-bold text-charcoal">{UPI_ID}</p>
          <div className="mt-2 flex justify-center gap-2">
            {[10, 50, 100].map(amt => (
              <button key={amt} onClick={() => { dismiss(false); router.push(`/dashboard/support?amount=${amt}`) }}
                className="rounded-lg bg-charcoal px-4 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90">
                {'\u20B9'}{amt}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button onClick={() => dismiss(true)}
            className="text-xs text-gray-400 underline hover:text-gray-600">
            Don't show again
          </button>
          <button onClick={() => dismiss(false)}
            className="text-xs text-gray-500 hover:text-charcoal">
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}
