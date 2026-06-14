import Link from 'next/link'
import { PRICING } from '@/lib/constants'

export default function PricingPage() {
  const plans = [
    { id: 'free', ...PRICING.free, name: 'Free', desc: 'For trying ToroPay and small volumes' },
    { id: 'pro', ...PRICING.pro, name: 'Pro', desc: 'For growing businesses needing webhooks' },
    { id: 'growth', ...PRICING.growth, name: 'Growth', desc: 'For teams and high transaction volume' },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream to-beige">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-2xl font-extrabold tracking-tight">Toro<span className="text-primary-500">Pay</span></Link>
        <Link href="/signup" className="rounded-xl bg-charcoal px-5 py-2.5 text-sm font-semibold text-white">Get started</Link>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-16 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight">Simple pricing for Indian businesses</h1>
        <p className="mx-auto mt-3 max-w-xl text-gray-500">Zero transaction fees. Money goes directly to your UPI ID.</p>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-24 sm:grid-cols-3">
        {plans.map(plan => (
          <div key={plan.id} className={`rounded-3xl border p-8 backdrop-blur-sm ${plan.id === 'pro' ? 'border-primary-500 bg-white shadow-lg' : 'border-white/80 bg-white/60'}`}>
            {plan.id === 'pro' && <span className="mb-3 inline-block rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-600">Popular</span>}
            <h2 className="text-xl font-bold">{plan.name}</h2>
            <p className="mt-1 text-sm text-gray-500">{plan.desc}</p>
            <p className="mt-4 text-4xl font-extrabold">
              {plan.price === 0 ? '₹0' : `₹${plan.price}`}
              {plan.price > 0 && <span className="text-base font-normal text-gray-400">/mo</span>}
            </p>
            <ul className="mt-6 space-y-2 text-left text-sm text-gray-600">
              <li>✓ {plan.links === 'unlimited' ? 'Unlimited' : plan.links} payment links</li>
              <li>✓ {plan.txns} txns/month</li>
              <li>{plan.webhooks ? '✓' : '✗'} Webhook callbacks</li>
              <li>{plan.custom_domain ? '✓' : '✗'} Custom domain</li>
              <li>{plan.team ? '✓' : '✗'} Team access</li>
            </ul>
            <Link href="/signup"
              className={`mt-8 block rounded-xl py-3 text-center text-sm font-semibold ${plan.id === 'pro' ? 'bg-charcoal text-white' : 'border border-gray-200 bg-white text-charcoal'}`}>
              Start {plan.name}
            </Link>
          </div>
        ))}
      </section>
    </div>
  )
}
