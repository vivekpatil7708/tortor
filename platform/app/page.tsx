import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cream to-beige">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="text-2xl font-extrabold tracking-tight">Toro<span className="text-primary-500">Pay</span></div>
        <div className="flex items-center gap-4">
          <Link href="/pricing" className="text-sm font-medium text-gray-600 hover:text-charcoal">Pricing</Link>
          <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-charcoal">Log in</Link>
          <Link href="/signup" className="rounded-xl bg-charcoal px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">Get started</Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 pt-24 pb-32 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary-50 px-4 py-1.5 text-sm font-medium text-primary-600">
          UPI Payment Infrastructure for India
        </div>
        <h1 className="text-5xl font-extrabold leading-tight tracking-tight sm:text-6xl">
          Your brand, your UPI ID,<br />
          <span className="text-primary-500">your payment pages</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-500">
          Create branded UPI payment links, QR codes, and hosted checkout pages using your own merchant UPI ID.
          No coding required. Pay only the subscription — zero transaction fees.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link href="/signup" className="rounded-xl bg-charcoal px-8 py-3.5 text-base font-semibold text-white hover:opacity-90">Create free account</Link>
          <a href="#how" className="rounded-xl border border-gray-200 bg-white/60 px-8 py-3.5 text-base font-semibold text-charcoal hover:bg-white">See how it works</a>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-6 pb-32">
        <h2 className="mb-16 text-center text-3xl font-bold tracking-tight">How it works</h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            { n: '1', t: 'Add your UPI ID', d: 'Enter your VPA like merchant@bank. We verify it instantly with a ₹1 check.' },
            { n: '2', t: 'Create a payment link', d: 'Set amount, description, custom fields. Brand it with your logo & colors.' },
            { n: '3', t: 'Share & get paid', d: 'Share the link or QR. Customers pay via any UPI app. You get webhook & dashboard.' },
          ].map(({ n, t, d }) => (
            <div key={n} className="rounded-2xl border border-white/80 bg-white/50 p-8 backdrop-blur-sm">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-charcoal text-sm font-bold text-white">{n}</div>
              <h3 className="mb-2 text-lg font-bold">{t}</h3>
              <p className="text-sm leading-relaxed text-gray-500">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-32">
        <h2 className="mb-16 text-center text-3xl font-bold tracking-tight">Everything you need</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            'Branded checkout pages', 'Dynamic QR codes', 'UPI app deep links', 'Transaction tracking',
            'Webhook callbacks', 'Custom fields', 'Link expiry & limits', 'Settlement status',
            'Dashboard analytics', 'Razorpay integration', 'Custom domain', 'Team access',
          ].map((f) => (
            <div key={f} className="rounded-xl border border-gray-100 bg-white/40 px-5 py-4 text-sm font-medium backdrop-blur-sm">✓ {f}</div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-32">
        <div className="rounded-3xl bg-charcoal px-8 py-16 text-center text-white">
          <h2 className="text-3xl font-bold tracking-tight">Start accepting UPI payments in minutes</h2>
          <p className="mt-3 text-gray-300">Free plan includes 10 payment links and 50 transactions per month. No credit card needed.</p>
          <Link href="/signup" className="mt-6 inline-block rounded-xl bg-primary-500 px-8 py-3.5 text-base font-semibold text-white hover:bg-primary-600">Create free account — it's free</Link>
        </div>
      </section>

      <footer className="border-t border-gray-200 px-6 py-8 text-center text-sm text-gray-400">
        ToroPay — Built for Indian businesses
      </footer>
    </div>
  )
}
