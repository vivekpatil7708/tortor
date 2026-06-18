import Link from 'next/link'
import DonateWidget from '@/components/donate-widget'

export default function DonatePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cream to-beige">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-2xl font-extrabold tracking-tight">
          Toro<span className="text-primary-500">Pay</span>
        </Link>
        <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-charcoal">Log in</Link>
      </header>

      <section className="mx-auto max-w-lg px-6 pt-16 pb-32">
        <div className="rounded-3xl border border-white/60 bg-white/40 p-8 text-center backdrop-blur-xl sm:p-12">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-3xl">
            {'❤️'}
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Support ToroPay</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-gray-500">
            ToroPay is and will always be <strong>completely free</strong> to use.
            If this platform helps you, consider donating to support hosting,
            maintenance, and future improvements.
          </p>

          <div className="mt-8 rounded-2xl border border-white/60 bg-white/50 p-6 backdrop-blur-sm">
            <DonateWidget />
          </div>

          <p className="mt-4 text-xs text-gray-400">
            We deeply value your support. Every contribution, no matter the size,
            helps us keep ToroPay free and thriving for everyone.
          </p>
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm font-medium text-gray-500 hover:text-charcoal">{'\u2190'} Back to ToroPay</Link>
        </div>
      </section>
    </div>
  )
}
