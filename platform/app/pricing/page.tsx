import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, Check, Minus } from 'lucide-react'
import { MarketingPage, PageHero, Section } from '@/components/marketing/site-shell'

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'ToroPay is free to use: no transaction fees, no setup charge and no per-order commission. See what is included and what can cost money outside ToroPay.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    url: 'https://www.toropay.co.in/pricing',
    title: 'ToroPay pricing',
    description: 'Free to use. No transaction fees, no setup charge, no commission.',
  },
}

const INCLUDED = [
  'Payment links with fixed or flexible amounts',
  'UPI QR codes and printable posters',
  'Branded hosted checkout',
  'Products, multi-item orders, coupons and tax lines',
  'Customer profiles, addresses and loyalty points',
  'Manual refund records',
  'Reminder-based subscriptions',
  'Shiprocket courier tracking',
  'Email notifications and WhatsApp (early access)',
  'API keys, signed webhooks and the MCP connector',
]

const OUTSIDE = [
  {
    title: 'Your bank or UPI app',
    body: 'Standard UPI transfers between people and businesses are governed by your bank and NPCI. ToroPay does not add a fee on top.',
  },
  {
    title: 'An aggregator you connect',
    body: 'If you enable Razorpay or Cashfree for a hosted checkout, their own pricing and settlement terms apply. That is separate from ToroPay.',
  },
  {
    title: 'Courier services',
    body: 'Shiprocket and any courier charges are billed by them, not by ToroPay.',
  },
  {
    title: 'Optional donations',
    body: 'Supporting ToroPay is voluntary. It does not unlock features or change your limits.',
  },
]

const FAQS = [
  {
    q: 'Is ToroPay really free?',
    a: 'Yes. There are no paid plans, transaction fees, setup charges or per-order commissions. You do not need to add a card to create an account or a payment link.',
  },
  {
    q: 'Does ToroPay take a percentage of each payment?',
    a: 'No. The money goes directly from the customer to the merchant\u2019s UPI ID. ToroPay never holds it, so there is nothing to take a percentage of.',
  },
  {
    q: 'What is the catch?',
    a: 'There is no paid tier hidden behind the free one. The trade-off is scope: ToroPay is a UPI-first payment link tool, not a full payment gateway, and direct UPI payments are confirmed by the merchant rather than an automatic bank feed.',
  },
  {
    q: 'Do I need a credit card?',
    a: 'No. Creating an account and a payment link does not require a card.',
  },
  {
    q: 'Are there limits on links or payments?',
    a: 'A payment link can have its own use limit or expiry date, which the merchant sets. There is no paid plan that raises an account-level cap.',
  },
  {
    q: 'How is ToroPay funded?',
    a: 'Optional donations from merchants help cover hosting and maintenance. They are not required to use the product.',
  },
]

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
}

const productSchema = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'ToroPay',
  description:
    'Free UPI payment links, QR codes and hosted checkout for Indian businesses. No transaction fees and no fund custody.',
  brand: { '@type': 'Brand', name: 'ToroPay' },
  url: 'https://www.toropay.co.in/pricing',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'INR',
    availability: 'https://schema.org/InStock',
    url: 'https://www.toropay.co.in/pricing',
  },
}

export default function PricingPage() {
  return (
    <MarketingPage>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }} />

      <PageHero
        eyebrow="Pricing"
        title="One plan: free."
        intro="No transaction fees. No setup charge. No per-order commission. The product is a UPI payment link tool, so the money never passes through ToroPay."
      />

      <Section>
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-olive-leaf-800 bg-white p-8">
            <div className="flex items-baseline gap-2">
              <p className="text-4xl font-extrabold tracking-tight text-black-forest">₹0</p>
              <p className="text-sm font-medium text-olive-leaf-400">to use ToroPay</p>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-olive-leaf-400">
              There is no paid tier in the product. Everything below is included for every account.
            </p>
            <ul className="mt-6 grid gap-2.5 text-sm leading-relaxed text-olive-leaf-400 sm:grid-cols-2">
              {INCLUDED.map(item => (
                <li key={item} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-copperwood" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Link href="/signup" className="mt-7 inline-flex items-center gap-2 rounded-full btn-blue-gradient px-5 py-2.5 text-sm font-semibold text-white">
              Create a free link <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          <div className="rounded-3xl border border-olive-leaf-800 bg-cornsilk-600 p-8">
            <h2 className="text-lg font-bold text-black-forest">What is not a ToroPay charge</h2>
            <ul className="mt-5 space-y-4 text-sm leading-relaxed text-olive-leaf-400">
              {OUTSIDE.map(item => (
                <li key={item.title}>
                  <p className="font-semibold text-black-forest">{item.title}</p>
                  <p className="mt-1">{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section className="border-y border-olive-leaf-800 bg-cornsilk-600">
        <h2 className="text-2xl font-bold tracking-tight text-black-forest">What you are not paying for</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            ['No commission', 'ToroPay does not take a cut of a payment. It never holds the payment.'],
            ['No feature gates', 'Links, checkout, orders, webhooks and the API are not behind a plan.'],
            ['No card on file', 'You do not need to enter payment details to use the product.'],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-olive-leaf-800 bg-white p-5">
              <h3 className="text-[15px] font-semibold text-black-forest">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-olive-leaf-400">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <h2 className="text-2xl font-bold tracking-tight text-black-forest">Questions</h2>
        <div className="mt-6 divide-y divide-olive-leaf-800 border-y border-olive-leaf-800">
          {FAQS.map(({ q, a }) => (
            <details key={q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-black-forest [&::-webkit-details-marker]:hidden">
                {q}
                <span className="text-copperwood transition-transform group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <p className="mt-2 pr-8 text-sm leading-relaxed text-olive-leaf-400">{a}</p>
            </details>
          ))}
        </div>
      </Section>

      <Section className="pb-20">
        <div className="rounded-3xl border border-olive-leaf-800 bg-white p-8 sm:p-10">
          <h2 className="text-xl font-bold tracking-tight text-black-forest">Support the project, if you want to</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-olive-leaf-400">
            Donations are optional and do not unlock anything. They help cover hosting, maintenance and
            future improvements.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/donate" className="inline-flex items-center gap-2 rounded-full border border-olive-leaf-800 bg-white px-5 py-2.5 text-sm font-semibold text-black-forest hover:bg-cornsilk-600">
              Support ToroPay
            </Link>
            <Link href="/features" className="inline-flex items-center gap-2 rounded-full border border-olive-leaf-800 bg-white px-5 py-2.5 text-sm font-semibold text-black-forest hover:bg-cornsilk-600">
              See all features
            </Link>
          </div>
        </div>
        <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-olive-leaf-400">
          <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Prices outside ToroPay (aggregator, courier, bank) are set by those providers and are not
          controlled by ToroPay.
        </p>
      </Section>
    </MarketingPage>
  )
}
