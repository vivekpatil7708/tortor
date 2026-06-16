'use client'

import { useEffect, useState } from 'react'
import { HeartHandshake } from 'lucide-react'

const UPI_ID = '9172632189@kotakbank'
const amounts = [10, 50, 100]

export default function SupportPage() {
  const [stats, setStats] = useState<{ total_txns: number; success_txns: number } | null>(null)

  useEffect(() => {
    fetch('/api/analytics').then(r => r.json()).then(d => {
      setStats({
        total_txns: d.total_transactions || 0,
        success_txns: d.by_status?.success || 0,
      })
    }).catch(() => {})
  }, [])

  return (
    <div>
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
          <HeartHandshake className="h-5 w-5 text-primary-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Support ToroPay</h1>
          <p className="text-sm text-gray-500">Help keep the platform free for everyone</p>
        </div>
      </div>

      {stats && stats.total_txns >= 3 && (
        <div className="mb-6 rounded-2xl border border-primary-200 bg-primary-50 px-5 py-4 text-sm text-primary-800">
          You've processed {stats.success_txns} payments — thank you for using ToroPay!
          If the platform helps your business, consider supporting it.
        </div>
      )}

      <div className="mx-auto max-w-lg">
        <div className="rounded-3xl border border-white/60 bg-white/40 p-8 text-center backdrop-blur-xl sm:p-12">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-3xl">
            {'❤️'}
          </div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Support the platform</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-gray-500">
            ToroPay is and will always be <strong>completely free</strong> to use — no paid plans,
            no transaction fees, no hidden charges. If this platform helps your business, please consider
            donating to support hosting, maintenance, and future improvements.
          </p>

          <div className="mt-8 rounded-2xl border border-white/60 bg-white/50 p-6 backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Donate via UPI</p>
            <p className="mt-1 font-mono text-lg font-bold text-charcoal">{UPI_ID}</p>

            <div className="mt-5 flex flex-wrap justify-center gap-3">
              {amounts.map(amt => (
                <a key={amt}
                  href={`upi://pay?pa=${UPI_ID}&pn=ToroPay&am=${amt}&cu=INR`}
                  className="min-w-[5rem] rounded-xl bg-charcoal px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90">
                  {'\u20B9'}{amt}
                </a>
              ))}
            </div>

            <div className="mt-3">
              <a href={`upi://pay?pa=${UPI_ID}&pn=ToroPay&cu=INR`}
                className="inline-block rounded-xl border border-gray-200 bg-white/60 px-6 py-3 text-sm font-semibold text-charcoal transition-colors hover:bg-white">
                Custom amount
              </a>
            </div>
          </div>

          <p className="mt-4 text-xs text-gray-400">
            Money goes directly to the UPI ID above via your UPI app.
            ToroPay never touches your donation.
          </p>
        </div>
      </div>
    </div>
  )
}
