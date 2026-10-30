import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, Check, Minus } from 'lucide-react'
import { MarketingPage, PageHero, Prose, Section } from '@/components/marketing/site-shell'

export const metadata: Metadata = {
  title: 'About',
  description:
    'What ToroPay is and is not: a free UPI payment link and light checkout tool for Indian businesses that never holds your money.',
  alternates: { canonical: '/about' },
  openGraph: {
    url: 'https://www.toropay.co.in/about',
    title: 'About ToroPay',
    description: 'A free UPI payment link tool. Not a gateway. It never holds your money.',
  },
}

const IS = [
  'A way to create a UPI payment link, QR code or small order form in a few minutes.',
  'A hosted, branded checkout page for businesses that do not have a website.',
  'A record of what you sold, who paid and what still needs your attention.',
]

const IS_NOT = [
  'A payment gateway, payment aggregator or PSP. It does not authorise or capture payments.',
  'A wallet or escrow. Money never sits with ToroPay.',
  'A card, netbanking or international payments product. The core flow is UPI.',
  'An auto-debit engine. Subscriptions send a fresh payment link each cycle.',
]

const PRINCIPLES = [
  {
    title: 'The merchant decides',
    body: 'For a direct UPI payment, the customer says they paid and the merchant checks their own bank or UPI app before marking it received. ToroPay does not guess.',
  },
  {
    title: 'No fund custody',
    body: 'There is no ToroPay balance to top up and no settlement step. Your customer pays your UPI ID, and the money reaches your bank-linked account.',
  },
  {
    title: 'Free means free',
    body: 'No transaction fees, no paid tier and no per-order commission. Optional donations help cover hosting.',
  },
  {
    title: 'Boring where it matters',
    body: 'Payment status changes are explicit, irreversible status changes are limited, and every change is recorded.',
  },
]

const LIMITS = [
  'A payment is only "received" once the merchant confirms it, or a signed provider webhook says so. There is no bank feed that auto-reconciles every UPI credit.',
  'Refunds are recorded, not moved. You send the money back in your own UPI app and ToroPay keeps the record.',
  'Subscriptions are reminder links. Customers are not auto-debited.',
  'WhatsApp messaging is early access and only appears for enabled accounts.',
  'There is no card, netbanking or international payment flow in the core product.',
]

const aboutSchema = {
  '@context': 'https://schema.org',
  '@type': 'AboutPage',
  name: 'About ToroPay',
  url: 'https://www.toropay.co.in/about',
  mainEntity: {
    '@type': 'Organization',
    name: 'ToroPay',
    url: 'https://www.toropay.co.in/',
    logo: 'https://www.toropay.co.in/favicon.svg',
    description:
      'ToroPay is a free UPI payment link and light checkout tool for Indian businesses. It does not hold funds.',
    areaServed: 'IN',
    sameAs: ['https://instagram.com/toropay.co.in'],
  },
}

export default function AboutPage() {
  return (
    <MarketingPage>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutSchema) }} />

      <PageHero
        eyebrow="About"
        title="A simple way to collect UPI payments, without becoming a payment company."
        intro="ToroPay gives Indian shops, creators and online sellers a payment link, a QR code and a hosted checkout. The money goes to the merchant's own UPI ID. We keep the record, not the funds."
      />

      <Section>
        <div className="grid gap-8 sm:grid-cols-2">
          <div className="rounded-2xl border border-olive-leaf-800 bg-white p-6">
            <h2 className="text-lg font-bold text-black-forest">What ToroPay is</h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-olive-leaf-400">
              {IS.map(item => (
                <li key={item} className="flex gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-copperwood" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-olive-leaf-800 bg-white p-6">
            <h2 className="text-lg font-bold text-black-forest">What it is not</h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-olive-leaf-400">
              {IS_NOT.map(item => (
                <li key={item} className="flex gap-2.5">
                  <Minus className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section className="border-y border-olive-leaf-800 bg-cornsilk-600">
        <h2 className="text-2xl font-bold tracking-tight text-black-forest">How the money moves</h2>
        <Prose>
          <p>
            When a customer opens a ToroPay payment link, they see your business name and amount, then
            pay inside their own UPI app (Google Pay, PhonePe, Paytm, BHIM and other UPI apps). The
            money moves from the customer&apos;s bank account to the UPI ID you entered - not to ToroPay.
          </p>
          <p>
            ToroPay records the checkout, shows the customer&apos;s claim, and lets you confirm what
            arrived in your bank or UPI app. That confirmation is what updates the order. This is
            deliberately manual for direct UPI, because no third party can see your bank credits.
          </p>
          <p>
            If you connect an aggregator such as Razorpay or Cashfree, their signed webhook can settle
            the payment instead. That is a separate, optional integration - not the default flow.
          </p>
        </Prose>
      </Section>

      <Section>
        <h2 className="text-2xl font-bold tracking-tight text-black-forest">What we optimise for</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {PRINCIPLES.map(item => (
            <div key={item.title} className="border-t border-olive-leaf-800 pt-5">
              <h3 className="text-base font-semibold text-black-forest">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-olive-leaf-400">{item.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section className="border-t border-olive-leaf-800">
        <h2 className="text-2xl font-bold tracking-tight text-black-forest">Limits, stated plainly</h2>
        <p className="mt-3 text-sm leading-relaxed text-olive-leaf-400">
          A tool is easier to trust when it says what it does not do. These are real constraints of the
          current product, not temporary marketing caveats.
        </p>
        <ul className="mt-6 space-y-3 text-sm leading-relaxed text-olive-leaf-400">
          {LIMITS.map(item => (
            <li key={item} className="flex gap-2.5">
              <Minus className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section className="pb-20">
        <div className="rounded-3xl border border-olive-leaf-800 bg-white p-8 sm:p-10">
          <h2 className="text-xl font-bold tracking-tight text-black-forest">Read the details before you rely on them</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-olive-leaf-400">
            The documentation explains the two payment pipelines, what each status means, and how
            webhooks and the API behave. If something is still unclear, tell us.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/how-payments-work" className="inline-flex items-center gap-2 rounded-full btn-blue-gradient px-5 py-2.5 text-sm font-semibold text-white">
              How payments work <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/docs" className="inline-flex items-center gap-2 rounded-full border border-olive-leaf-800 bg-white px-5 py-2.5 text-sm font-semibold text-black-forest hover:bg-cornsilk-600">
              Documentation
            </Link>
            <Link href="/feedback" className="inline-flex items-center gap-2 rounded-full border border-olive-leaf-800 bg-white px-5 py-2.5 text-sm font-semibold text-black-forest hover:bg-cornsilk-600">
              Send feedback
            </Link>
          </div>
        </div>
      </Section>
    </MarketingPage>
  )
}
