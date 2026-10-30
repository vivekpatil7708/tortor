import Link from 'next/link'
import type { Metadata } from 'next'
import DonateWidget from '@/components/donate-widget'

export const metadata: Metadata = {
  title: 'Support ToroPay',
  description: 'ToroPay is free to use. Learn how optional donations help cover hosting, maintenance, and future improvements.',
  alternates: { canonical: '/donate' },
}

export default function DonatePage() {
  return (
    <div className="auth-shell min-h-screen bg-blue-hero">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-2xl font-extrabold tracking-tight text-white">
          Toro<span className="text-sunlit-clay">Pay</span>
        </Link>
        <Link href="/login" className="text-sm font-medium text-gray-300 hover:text-white">Log in</Link>
      </header>

      <section className="mx-auto max-w-lg px-6 pt-16 pb-32">
        <div className="rounded-3xl border border-white/60 bg-white/95 p-8 text-center shadow-2xl shadow-black/20 backdrop-blur-2xl sm:p-12">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sunlit-clay/30 text-3xl">
            {'❤️'}
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Support ToroPay</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-gray-600">
            ToroPay is and will always be <strong>completely free</strong> to use.
            If this platform helps you, consider donating to support hosting,
            maintenance, and future improvements.
          </p>

          <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-6">
            <DonateWidget />
          </div>

          <p className="mt-4 text-xs text-gray-600">
            We deeply value your support. Every contribution, no matter the size,
            helps us keep ToroPay free and thriving for everyone.
          </p>
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm font-medium text-gray-400 hover:text-white">{'\u2190'} Back to ToroPay</Link>
        </div>
      </section>
    </div>
  )
}
