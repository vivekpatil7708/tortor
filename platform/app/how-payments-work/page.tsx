import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { MarketingPage, PageHero, Prose, Section } from '@/components/marketing/site-shell'

export const metadata: Metadata = {
  title: 'How payments work',
  description:
    'The two ToroPay payment pipelines, every status in plain words, and who is allowed to mark a payment as received. Direct UPI stays merchant-confirmed.',
  alternates: { canonical: '/how-payments-work' },
  openGraph: {
    url: 'https://www.toropay.co.in/how-payments-work',
    title: 'How ToroPay payments work',
    description: 'Direct UPI is merchant-confirmed. Provider checkouts settle on a signed webhook. Here is the difference.',
  },
}

const STATUS_ROWS = [
  {
    label: 'Started',
    stored: 'initiated',
    means: 'The customer opened the payment page but has not said they paid.',
    next: 'If the money reached you anyway, you can still confirm it.',
  },
  {
    label: 'Abandoned',
    stored: 'initiated (older than 30 minutes)',
    means: 'The customer started but did not finish within the hold window.',
    next: 'Same as Started: confirm it manually if the money arrived.',
  },
  {
    label: 'Customer says paid',
    stored: 'pending',
    means: 'The customer tapped "I have paid". This is a claim, not proof.',
    next: 'Check your bank or UPI app, then confirm or reject.',
  },
  {
    label: 'Paid',
    stored: 'success',
    means: 'You confirmed the money arrived (or a signed provider webhook did).',
    next: 'The order advances, loyalty points are awarded and a webhook fires.',
  },
  {
    label: 'Rejected',
    stored: 'failed',
    means: 'You marked the payment as not received.',
    next: 'A late payment can still be confirmed as received.',
  },
]

const WHO_CAN = [
  {
    who: 'The customer',
    can: 'Say they have paid. That moves a started payment to "Customer says paid".',
    cannot: 'Mark a payment as paid, or change a payment that is already final.',
  },
  {
    who: 'The merchant',
    can: 'Confirm or reject a direct UPI payment after checking their own bank or UPI app.',
    cannot: 'Undo a confirmation more than 30 minutes after making it.',
  },
  {
    who: 'A signed provider webhook',
    can: 'Settle a hosted checkout payment (Razorpay, Cashfree or the mock provider) after HMAC verification and an amount check.',
    cannot: 'Settle a direct UPI payment link. There is no UPI provider webhook.',
  },
  {
    who: 'An API key or AI assistant with write scope',
    can: 'Confirm or reject payments through the v1 API, including the live workspace.',
    cannot: 'Do anything the merchant could not do. Every action is audit-logged.',
  },
]

const FAQS = [
  {
    q: 'Does ToroPay confirm a UPI payment automatically?',
    a: 'No. For a direct UPI payment link, the customer says they paid, then the merchant checks their own bank or UPI app and confirms it. ToroPay has no bank feed that can verify every UPI credit.',
  },
  {
    q: 'Can a customer mark their own payment as paid?',
    a: 'No. A customer can only mark a started payment as "Customer says paid", which is a claim. Only the merchant, a signed provider webhook, or an authorised API client can mark it paid.',
  },
  {
    q: 'What if the customer paid but never tapped "I have paid"?',
    a: 'The payment stays "Started" or becomes "Abandoned" after 30 minutes. The merchant can still open it and confirm the payment if the money arrived.',
  },
  {
    q: 'Can a confirmation be undone?',
    a: 'Yes, within 30 minutes. A confirmed payment can only be moved to "Rejected" in that window. After that it is final.',
  },
  {
    q: 'Does ToroPay hold or settle the money?',
    a: 'No. Money moves from the customer to the merchant\u2019s own UPI ID. There is no ToroPay balance, wallet, escrow or settlement step.',
  },
  {
    q: 'Can an AI assistant confirm payments?',
    a: 'Yes, if the merchant connects it through OAuth with the write scope. The consent screen says "Create and confirm payments on your behalf". The merchant can revoke access from Settings, and every change is recorded.',
  },
  {
    q: 'Do subscriptions auto-debit the customer?',
    a: 'No. Each billing cycle creates a fresh payment link. The customer pays it like any other UPI payment.',
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

const howToSchema = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'How a direct UPI payment completes in ToroPay',
  description: 'The merchant-confirmed path for a ToroPay UPI payment link.',
  step: [
    { '@type': 'HowToStep', name: 'Share the link', text: 'The merchant shares a payment link or QR code.' },
    { '@type': 'HowToStep', name: 'Customer pays', text: 'The customer opens the link and pays the merchant UPI ID in their own UPI app.' },
    { '@type': 'HowToStep', name: 'Customer says paid', text: 'The customer taps "I have paid", which marks the payment as a claim, not paid.' },
    { '@type': 'HowToStep', name: 'Merchant checks', text: 'The merchant checks their bank or UPI app for the credit.' },
    { '@type': 'HowToStep', name: 'Merchant confirms', text: 'The merchant confirms the payment, which advances the order and records the status.' },
  ],
}

export default function HowPaymentsWorkPage() {
  return (
    <MarketingPage>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }} />

      <PageHero
        eyebrow="How it works"
        title="Two payment pipelines. One rule: nobody guesses whether money arrived."
        intro="ToroPay handles direct UPI payment links and optional aggregator checkouts differently. This page explains both, using the same status words you see in the dashboard."
      />

      <Section>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-olive-leaf-800 bg-white p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-copperwood">Default</p>
            <h2 className="mt-2 text-lg font-bold text-black-forest">Direct UPI payment link</h2>
            <p className="mt-2 text-sm leading-relaxed text-olive-leaf-400">
              Money goes from the customer to your UPI ID. The customer says they paid; you check your
              bank or UPI app and confirm. No aggregator, no fee, no custody.
            </p>
          </div>
          <div className="rounded-2xl border border-olive-leaf-800 bg-white p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-copperwood">Optional</p>
            <h2 className="mt-2 text-lg font-bold text-black-forest">Provider checkout</h2>
            <p className="mt-2 text-sm leading-relaxed text-olive-leaf-400">
              A hosted checkout can use Razorpay or Cashfree. Their signed webhook settles the payment
              after ToroPay verifies the signature and the amount.
            </p>
          </div>
        </div>
      </Section>

      <Section className="border-y border-olive-leaf-800 bg-cornsilk-600">
        <h2 className="text-2xl font-bold tracking-tight text-black-forest">The direct UPI path, step by step</h2>
        <ol className="mt-7 space-y-5">
          {[
            ['Share the link', 'The merchant shares a payment link or QR code on WhatsApp, Instagram, SMS, email or a printed poster.'],
            ['Customer pays', 'The link opens a UPI intent. The customer reviews the payee name and amount, then approves the payment in their own UPI app.'],
            ['Customer says paid', 'Back on the ToroPay page, the customer taps "I have paid". The payment moves to "Customer says paid" - a claim, not a confirmation.'],
            ['Merchant checks', 'The merchant looks at their bank account or UPI app. ToroPay cannot see that credit.'],
            ['Merchant confirms', 'The merchant marks the payment paid. The order advances, loyalty points are awarded and any subscribed webhook fires.'],
          ].map(([title, body], index) => (
            <li key={title} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-copperwood text-sm font-bold text-white">{index + 1}</span>
              <div>
                <h3 className="text-base font-semibold text-black-forest">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-olive-leaf-400">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section>
        <h2 className="text-2xl font-bold tracking-tight text-black-forest">What each status means</h2>
        <p className="mt-2 text-sm leading-relaxed text-olive-leaf-400">
          The dashboard uses plain words. The database stores a shorter set of values.
        </p>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-olive-leaf-800 bg-white">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead className="border-b border-olive-leaf-800 text-xs uppercase tracking-wide text-olive-leaf-400">
              <tr>
                <th className="px-4 py-3 font-semibold">You see</th>
                <th className="px-4 py-3 font-semibold">Stored as</th>
                <th className="px-4 py-3 font-semibold">What it means</th>
                <th className="px-4 py-3 font-semibold">What happens next</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-olive-leaf-800">
              {STATUS_ROWS.map(row => (
                <tr key={row.label}>
                  <td className="px-4 py-3 font-semibold text-black-forest">{row.label}</td>
                  <td className="px-4 py-3 font-mono text-xs text-olive-leaf-400">{row.stored}</td>
                  <td className="px-4 py-3 text-olive-leaf-400">{row.means}</td>
                  <td className="px-4 py-3 text-olive-leaf-400">{row.next}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section className="border-t border-olive-leaf-800">
        <h2 className="text-2xl font-bold tracking-tight text-black-forest">Who can change a payment</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {WHO_CAN.map(row => (
            <div key={row.who} className="rounded-2xl border border-olive-leaf-800 bg-white p-5">
              <h3 className="text-[15px] font-semibold text-black-forest">{row.who}</h3>
              <p className="mt-2 text-sm leading-relaxed text-olive-leaf-400">
                <span className="font-semibold text-green-700">Can:</span> {row.can}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-olive-leaf-400">
                <span className="font-semibold text-red-700">Cannot:</span> {row.cannot}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section className="border-t border-olive-leaf-800">
        <h2 className="text-2xl font-bold tracking-tight text-black-forest">The provider path, if you enable it</h2>
        <Prose>
          <p>
            When a hosted checkout uses an aggregator, ToroPay creates the provider session and waits
            for a webhook. The webhook&apos;s raw body is verified with the provider&apos;s signing
            secret before anything is parsed. The event id is stored so a retry cannot be applied
            twice, and the amount is checked against the order. A mismatch is flagged rather than
            silently accepted.
          </p>
          <p>
            A payment can move from pending to processing to paid, failed or expired. Once paid, it can
            only move to a refund or dispute state. A late success after a failure is still accepted,
            because money can arrive out of order.
          </p>
        </Prose>
      </Section>

      <Section className="border-t border-olive-leaf-800">
        <div className="flex items-start gap-3 rounded-2xl border border-olive-leaf-800 bg-white p-6">
          <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-copperwood" aria-hidden />
          <div>
            <h2 className="text-lg font-bold text-black-forest">What ToroPay never does</h2>
            <p className="mt-2 text-sm leading-relaxed text-olive-leaf-400">
              It does not hold funds, settle money, auto-confirm a direct UPI credit, move a refund, or
              auto-debit a subscription. Those are not configuration choices - the product has no code
              path for them.
            </p>
          </div>
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
          <h2 className="text-xl font-bold tracking-tight text-black-forest">Go deeper</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-olive-leaf-400">
            The documentation covers payment links, statuses, webhooks, the API and the MCP connector.
            Each page also has a Markdown version for tools and assistants.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/docs/payment-status" className="inline-flex items-center gap-2 rounded-full btn-blue-gradient px-5 py-2.5 text-sm font-semibold text-white">
              Payment status docs <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/docs" className="inline-flex items-center gap-2 rounded-full border border-olive-leaf-800 bg-white px-5 py-2.5 text-sm font-semibold text-black-forest hover:bg-cornsilk-600">
              All documentation
            </Link>
          </div>
        </div>
      </Section>
    </MarketingPage>
  )
}
