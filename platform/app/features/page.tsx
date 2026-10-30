import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, Minus } from 'lucide-react'
import { MarketingPage, PageHero, Section } from '@/components/marketing/site-shell'

export const metadata: Metadata = {
  title: 'Features',
  description:
    'What ToroPay actually does: UPI payment links, QR codes, hosted checkout, orders, coupons, customers, manual refunds, reminder subscriptions, webhooks and an API. Plus what it does not do.',
  alternates: { canonical: '/features' },
  openGraph: {
    url: 'https://www.toropay.co.in/features',
    title: 'ToroPay features',
    description: 'Payment links, checkout, orders and records for Indian businesses - with the limits stated plainly.',
  },
}

type Status = 'available' | 'early' | 'not-included'

const STATUS_LABEL: Record<Status, string> = {
  available: 'Available',
  early: 'Early access',
  'not-included': 'Not included',
}

const STATUS_STYLE: Record<Status, string> = {
  available: 'bg-green-50 text-green-700 border-green-200',
  early: 'bg-amber-50 text-amber-800 border-amber-200',
  'not-included': 'bg-gray-100 text-gray-600 border-gray-200',
}

const GROUPS: Array<{
  title: string
  intro: string
  items: Array<{ name: string; body: string; status: Status }>
}> = [
  {
    title: 'Get paid',
    intro: 'The core product: a link or QR that opens a UPI payment.',
    items: [
      {
        name: 'Payment links with a fixed or flexible amount',
        body: 'Set the amount yourself, or let the customer enter it. Save a setup as a template and reuse it.',
        status: 'available',
      },
      {
        name: 'Reusable links, use limits and expiry',
        body: 'A link can be reused, capped at a number of uses, or set to expire. The price is re-checked on the server.',
        status: 'available',
      },
      {
        name: 'UPI QR codes and posters',
        body: 'Every link has a QR code and a printable poster for a counter, invoice or shop window.',
        status: 'available',
      },
      {
        name: 'Branded hosted checkout',
        body: 'Your business name, logo and colours on a ToroPay-hosted page. No website needed.',
        status: 'available',
      },
      {
        name: 'Custom fields and customer notes',
        body: 'Ask for a reference, size, delivery note or anything else that belongs with the payment.',
        status: 'available',
      },
      {
        name: 'Every UPI app',
        body: 'The checkout opens a standard UPI intent, so the customer pays in the UPI app already on their phone.',
        status: 'available',
      },
    ],
  },
  {
    title: 'Sell and keep records',
    intro: 'A light back office around the payment, not a full storefront.',
    items: [
      {
        name: 'Products and multi-item orders',
        body: 'Physical, digital and service products, with quantity, price, tax, shipping and discount lines.',
        status: 'available',
      },
      {
        name: 'Coupons',
        body: 'Create discount codes, then apply them when building a link or order. Redemption is recorded per order.',
        status: 'available',
      },
      {
        name: 'Customers and addresses',
        body: 'Save names, phone numbers, emails, addresses and notes so repeat checkouts are shorter.',
        status: 'available',
      },
      {
        name: 'Loyalty points',
        body: 'Award points when a payment is confirmed, reverse them if the confirmation is undone, and adjust manually.',
        status: 'available',
      },
      {
        name: 'Refund records',
        body: 'Record what you promised to refund and mark it sent. The money is returned in your own UPI app, not by ToroPay.',
        status: 'available',
      },
      {
        name: 'Invoices and transaction history',
        body: 'Each order and payment has a record you can look up, export or send to Google Sheets.',
        status: 'available',
      },
    ],
  },
  {
    title: 'Run the business',
    intro: 'The supporting pieces. Some are narrower than they sound.',
    items: [
      {
        name: 'Subscriptions as reminder links',
        body: 'Weekly, monthly or yearly plans create a fresh payment link each cycle. Customers are not auto-debited.',
        status: 'available',
      },
      {
        name: 'Email notifications',
        body: 'Payment, order and delivery updates by email when a customer email is saved.',
        status: 'available',
      },
      {
        name: 'WhatsApp notifications',
        body: 'Outbound updates through an OpenWA gateway. Rolled out to enabled accounts only.',
        status: 'early',
      },
      {
        name: 'Shiprocket courier tracking',
        body: 'Create shipments, add tracking and receive status updates through Shiprocket. A built-in mock courier is available for testing.',
        status: 'available',
      },
      {
        name: 'Delhivery courier tracking',
        body: 'The provider contract exists, but Delhivery is a placeholder in this release. Use Shiprocket, which routes Delhivery shipments.',
        status: 'early',
      },
      {
        name: 'Team roles',
        body: 'Invite team members and give them owner or member access to the dashboard.',
        status: 'available',
      },
      {
        name: 'Analytics',
        body: 'Payment, order and page-view summaries in the dashboard.',
        status: 'available',
      },
      {
        name: 'API, webhooks and MCP',
        body: 'Scoped API keys, signed webhook deliveries, and an OAuth flow for AI assistants through the external ToroPay MCP connector.',
        status: 'available',
      },
    ],
  },
]

const NOT_INCLUDED = [
  'Card, netbanking, wallet or international payments in the core product.',
  'Holding funds, a merchant wallet, escrow or a settlement balance.',
  'Automatic bank reconciliation of every UPI credit.',
  'Auto-debit or UPI AutoPay mandates for subscriptions.',
  'A self-serve refund portal for customers.',
  'Merchant two-factor authentication. (ToroPay has email verification and Google sign-in; authenticator codes are used for the admin console, not merchant accounts.)',
  'A drop-in JavaScript checkout SDK embedded in your own site. Integrations use links, the API or webhooks instead.',
]

const softwareSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'ToroPay',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: 'https://www.toropay.co.in/features',
  description:
    'Free UPI payment links, QR codes and hosted checkout for Indian businesses, with orders, coupons, customers, manual refund records and reminder subscriptions.',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
  featureList: GROUPS.flatMap(group => group.items.filter(item => item.status !== 'not-included').map(item => item.name)),
}

export default function FeaturesPage() {
  return (
    <MarketingPage>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />

      <PageHero
        eyebrow="Features"
        title="Everything the product does, and the parts it deliberately does not."
        intro="This page is a map of the current build, not a roadmap. Each item is either available now, in early access, or explicitly not included."
      />

      <Section className="pb-6">
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          {(['available', 'early', 'not-included'] as Status[]).map(status => (
            <span key={status} className={`rounded-full border px-3 py-1 ${STATUS_STYLE[status]}`}>
              {STATUS_LABEL[status]}
            </span>
          ))}
        </div>
      </Section>

      {GROUPS.map(group => (
        <Section key={group.title} className="border-t border-olive-leaf-800 first:border-t-0">
          <h2 className="text-2xl font-bold tracking-tight text-black-forest">{group.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-olive-leaf-400">{group.intro}</p>
          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            {group.items.map(item => (
              <div key={item.name} className="rounded-2xl border border-olive-leaf-800 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[15px] font-semibold text-black-forest">{item.name}</h3>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[item.status]}`}>
                    {STATUS_LABEL[item.status]}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-olive-leaf-400">{item.body}</p>
              </div>
            ))}
          </div>
        </Section>
      ))}

      <Section className="border-t border-olive-leaf-800">
        <h2 className="text-2xl font-bold tracking-tight text-black-forest">Not included</h2>
        <p className="mt-2 text-sm leading-relaxed text-olive-leaf-400">
          These are not gaps in a pricing tier. They are outside the product ToroPay is built to be.
        </p>
        <ul className="mt-6 space-y-3 text-sm leading-relaxed text-olive-leaf-400">
          {NOT_INCLUDED.map(item => (
            <li key={item} className="flex gap-2.5">
              <Minus className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section className="pb-20">
        <div className="rounded-3xl border border-olive-leaf-800 bg-white p-8 sm:p-10">
          <h2 className="text-xl font-bold tracking-tight text-black-forest">See how a payment actually completes</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-olive-leaf-400">
            The status rules matter more than the feature list. The next page walks through both
            pipelines and who is allowed to mark a payment as received.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/how-payments-work" className="inline-flex items-center gap-2 rounded-full btn-blue-gradient px-5 py-2.5 text-sm font-semibold text-white">
              How payments work <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/pricing" className="inline-flex items-center gap-2 rounded-full border border-olive-leaf-800 bg-white px-5 py-2.5 text-sm font-semibold text-black-forest hover:bg-cornsilk-600">
              Pricing
            </Link>
          </div>
        </div>
      </Section>
    </MarketingPage>
  )
}
