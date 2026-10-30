import Link from 'next/link'
import type { Metadata } from 'next'
import { LandingMenu } from '@/components/landing/mobile-menu'
import { ToolShowcase } from '@/components/landing/tool-showcase'
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronDown,
  Lock,
  ShieldCheck,
  ShoppingBag,
  Store,
  Wallet,
} from 'lucide-react'

export const metadata: Metadata = {
  title: { absolute: 'Free UPI Payment Links for Indian Businesses | ToroPay' },
  description:
    'Create a free UPI payment link or QR code and get paid directly to your own UPI ID. Built for Indian shops, creators and online sellers. No website, no payment gateway, no transaction fees.',
  alternates: { canonical: '/' },
  openGraph: {
    url: 'https://www.toropay.co.in/',
    title: 'ToroPay — Free UPI Payment Links for Indian Businesses',
    description:
      'Create a payment link, share it on WhatsApp, and get paid directly to your UPI ID. Free to use, with no transaction fees.',
    siteName: 'ToroPay',
    locale: 'en_IN',
    type: 'website',
  },
}

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'ToroPay',
  url: 'https://www.toropay.co.in/',
  logo: 'https://www.toropay.co.in/favicon.svg',
  description:
    'ToroPay is a free UPI payment link and checkout tool for Indian businesses. Merchants share links or QR codes and receive payments directly in their own UPI account.',
  areaServed: 'IN',
}

const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'ToroPay',
  url: 'https://www.toropay.co.in/',
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: 'https://www.toropay.co.in/blog/search?q={search_term_string}',
    },
    'query-input': 'required name=search_term_string',
  },
}

const softwareSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'ToroPay',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: 'https://www.toropay.co.in/',
  description:
    'Free UPI payment links, QR codes and branded checkout for Indian businesses. Payments go directly to the merchant’s own UPI ID.',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
}

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Is ToroPay really free?',
    a: 'Yes. There are no paid plans, transaction fees or setup charges. You can create payment links, QR codes and a checkout page without adding a credit card.',
  },
  {
    q: 'How do I get paid?',
    a: 'Payments go directly to your own UPI ID. ToroPay does not process or hold your funds, so there is no settlement step and no commission on a sale.',
  },
  {
    q: 'Where does the money go?',
    a: 'ToroPay never holds your money or collects card details. Your customer approves the payment inside their own UPI app, and the money lands in your bank-linked UPI account.',
  },
  {
    q: 'Do I need a website or payment gateway?',
    a: 'No. ToroPay hosts the payment page for you. You only need a UPI ID linked to your bank account, and you can share the link on WhatsApp, Instagram, SMS or email.',
  },
  {
    q: 'Can I sell products and collect orders?',
    a: 'Yes. Add physical, digital or service products, then build a payment link or order form with multiple items, coupons, tax and delivery details. Orders and invoices stay in your dashboard.',
  },
  {
    q: 'Can I create subscriptions?',
    a: 'You can create weekly, monthly or yearly plans and attach a payment link for each billing cycle. ToroPay tracks every billing attempt but does not auto-debit a customer’s UPI account.',
  },
  {
    q: 'Can I try it before creating an account?',
    a: 'Yes. The checkout preview on this page is interactive, and the live demo opens a real ToroPay checkout with sample data. You only need an account when you are ready to create a link for your own UPI ID.',
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

type FeatureGroup = {
  icon: typeof Wallet
  title: string
  description: string
  points: string[]
}

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    icon: Wallet,
    title: 'Get paid',
    description: 'Turn a conversation into a checkout.',
    points: [
      'Payment links with fixed or custom amounts — save your setup as a template',
      'QR codes for your counter, invoice or poster',
      'Branded checkout with your logo and colours',
      'Every UPI app, paid directly to your UPI ID',
    ],
  },
  {
    icon: ShoppingBag,
    title: 'Sell',
    description: 'Take orders without building a website.',
    points: [
      'Physical, digital and service products',
      'Multi-item order forms and coupons',
      'Weekly, monthly or yearly subscriptions',
      'Orders, stock and tax invoices',
    ],
  },
  {
    icon: BarChart3,
    title: 'Run the business',
    description: 'Keep the customer and the record.',
    points: [
      'Customer profiles, addresses and loyalty points',
      'Email and WhatsApp updates (WhatsApp early access)',
      'Shiprocket tracking, refunds and returns',
      'Analytics, team roles, API and webhooks',
    ],
  },
]

const TRUST = [
  {
    icon: ShieldCheck,
    title: 'Direct to your UPI ID',
    body: 'Payments land in your own bank-linked UPI account. ToroPay never holds your money.',
  },
  {
    icon: Lock,
    title: 'No card details',
    body: 'Customers approve the payment inside their own UPI app, not on a card form.',
  },
  {
    icon: CheckCircle2,
    title: 'Free, with no paid tier',
    body: 'No transaction fees, no paid tier and no per-order commission.',
  },
]

const STEPS = [
  {
    title: 'Add your UPI ID',
    body: 'Enter the UPI ID where you want payments to land. We check the format before you share anything.',
  },
  {
    title: 'Create a link or QR',
    body: 'Choose an amount, add your business name and branding, or build an order form with products and coupons.',
  },
  {
    title: 'Share it and get paid',
    body: 'Send the link on WhatsApp, Instagram or SMS. Your customer pays in their UPI app and the money goes straight to you.',
  },
]

const AUDIENCES = [
  {
    icon: Store,
    title: 'Local shops',
    body: 'A QR code at the counter or a link on WhatsApp, with a clear record of every sale.',
  },
  {
    icon: ShoppingBag,
    title: 'Online sellers',
    body: 'Products, coupons, orders and delivery tracking without building a full storefront.',
  },
  {
    icon: Briefcase,
    title: 'Creators and services',
    body: 'Fixed fees, deposits and recurring plans with invoices that look professional.',
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-cornsilk text-black-forest">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      <header className="sticky top-0 z-40 border-b border-white/10 glass-blue shadow-[0_1px_0_0_rgba(96,165,250,0.12)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="text-xl font-extrabold tracking-tight text-white">
            Toro<span className="text-sunlit-clay">Pay</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-medium text-gray-300 md:flex" aria-label="Landing">
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#how" className="hover:text-white">How it works</a>
            <Link href="/pricing" className="hover:text-white">Pricing</Link>
            <Link href="/docs" className="hover:text-white">Docs</Link>
            <Link href="/blog" className="hover:text-white">Blog</Link>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-gray-300 hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="whitespace-nowrap rounded-full btn-blue-gradient px-4 py-2 text-sm font-semibold text-white transition-colors"
            >
              Create free link
            </Link>
            <LandingMenu />
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pb-16 pt-8 sm:pt-10 lg:pb-20 lg:pt-12">
          <ToolShowcase
            hero={
              <>
                <h1 className="max-w-xl text-4xl font-extrabold leading-[1.08] tracking-tight text-cornsilk sm:text-5xl lg:text-4xl xl:text-[2.75rem]">
                  Free UPI payment links.{' '}
                  <span className="lg:whitespace-nowrap">No payment gateway.</span>
                </h1>
                <p className="mt-5 max-w-lg text-base leading-relaxed text-cornsilk">
                  ToroPay is for Indian shops, creators and online sellers who want to get paid without a website or gateway.
                  Share a payment link or QR code and the money goes straight to your UPI ID.
                </p>

                <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link
                    href="/signup"
                    className="inline-flex items-center justify-center gap-2 rounded-full btn-blue-gradient px-5 py-3 text-base font-semibold text-white transition-colors"
                  >
                    Create a free link <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                  <Link
                    href="/pay/demo-booking"
                    className="inline-flex items-center justify-center gap-1.5 text-base font-semibold text-cornsilk underline decoration-cornsilk/40 underline-offset-4 hover:decoration-cornsilk"
                  >
                    Open the live checkout <ArrowUpRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>

                <div className="mt-5 flex w-fit max-w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-xs font-medium text-gray-200 backdrop-blur-md sm:text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-sunlit-clay" aria-hidden /> No card details
                  </span>
                  <span className="hidden h-1 w-1 rounded-full bg-white/30 sm:inline-block" aria-hidden />
                  <span>No gateway</span>
                  <span className="hidden h-1 w-1 rounded-full bg-white/30 sm:inline-block" aria-hidden />
                  <span>Money goes directly to you</span>
                </div>
              </>
            }
          />
        </section>

        <section className="relative overflow-hidden bg-blue-hero px-6 py-10 sm:py-12">
          <div
            className="pointer-events-none absolute -right-40 -top-48 h-[28rem] w-[28rem] rounded-full border-[2.5rem] border-sunlit-clay/10"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-32 -left-24 h-64 w-64 rounded-full bg-sunlit-clay/[0.05] blur-3xl"
            aria-hidden
          />
          <div className="relative mx-auto max-w-6xl rounded-[2rem] glass-blue p-6 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.85)] sm:p-8">
            <div className="grid gap-6 sm:grid-cols-3">
              {TRUST.map(item => {
                const Icon = item.icon
                return (
                  <div key={item.title} className="flex gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sunlit-clay/20 bg-sunlit-clay/10 text-sunlit-clay">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                      <p className="text-base font-semibold text-white">{item.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-gray-300">{item.body}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section id="features" className="relative mx-auto max-w-6xl scroll-mt-24 overflow-hidden px-6 py-20 sm:py-24">
          <div
            className="pointer-events-none absolute -right-44 top-4 h-[30rem] w-[30rem] rounded-full border border-sunlit-clay/25"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -right-24 top-20 h-[22rem] w-[22rem] rounded-full border border-gray-300/70"
            aria-hidden
          />
          <div className="relative max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Everything you need to get paid and keep track.</h2>
            <p className="mt-3 text-base leading-relaxed text-olive-leaf">
              One free account gives you the link, the checkout and the records behind it. No add-ons or paid tiers.
            </p>
          </div>

          <div className="mt-12 grid gap-10 sm:grid-cols-3">
            {FEATURE_GROUPS.map(group => {
              const Icon = group.icon
              return (
                <div key={group.title}>
                  <Icon className="h-6 w-6 text-copperwood" aria-hidden />
                  <h3 className="mt-4 text-lg font-semibold">{group.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-olive-leaf">{group.description}</p>
                  <ul className="mt-5 space-y-3">
                    {group.points.map(point => (
                      <li key={point} className="flex gap-2.5 text-sm leading-relaxed text-olive-leaf">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-copperwood" aria-hidden />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </section>

        <section id="how" className="relative scroll-mt-24 overflow-hidden border-y border-olive-leaf-800 bg-cornsilk-600">
          <div
            className="pointer-events-none absolute -right-28 -top-36 h-96 w-96 rounded-full border-[3rem] border-sunlit-clay/20"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-48 -left-32 h-80 w-80 rounded-full bg-sunlit-clay/15 blur-3xl"
            aria-hidden
          />
          <div className="relative mx-auto max-w-6xl px-6 py-20 sm:py-24">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Three steps to your first payment.</h2>
              <p className="mt-3 text-base leading-relaxed text-olive-leaf">
                No integration, no merchant approval and no code.
              </p>
            </div>

            <div className="mt-12 grid gap-10 sm:grid-cols-3">
              {STEPS.map((step, index) => (
                <div key={step.title} className="border-t border-olive-leaf-800 pt-5">
                  <p className="text-sm font-semibold text-olive-leaf">Step {index + 1}</p>
                  <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-olive-leaf">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="who" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-20 sm:py-24">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Built for the way you already sell.</h2>
            <p className="mt-3 text-base leading-relaxed text-olive-leaf">
              If you take payments on WhatsApp, at a counter or through a link in your bio, ToroPay fits.
            </p>
          </div>

          <div className="mt-12 grid gap-10 sm:grid-cols-3">
            {AUDIENCES.map(audience => {
              const Icon = audience.icon
              return (
                <div key={audience.title}>
                  <Icon className="h-6 w-6 text-copperwood" aria-hidden />
                  <h3 className="mt-4 text-lg font-semibold">{audience.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-olive-leaf">{audience.body}</p>
                </div>
              )
            })}
          </div>
        </section>

        <section id="faq" className="relative scroll-mt-24 overflow-hidden border-t border-olive-leaf-800 bg-cornsilk-700">
          <div
            className="pointer-events-none absolute -bottom-48 -left-32 h-80 w-80 rounded-full border-[2rem] border-sunlit-clay/20"
            aria-hidden
          />
          <div className="relative mx-auto max-w-3xl px-6 py-20 sm:py-24">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Questions, answered.</h2>
            <div className="mt-8 divide-y divide-olive-leaf-800 border-y border-olive-leaf-800">
              {FAQS.map(({ q, a }) => (
                <details key={q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-black-forest [&::-webkit-details-marker]:hidden">
                    {q}
                    <ChevronDown className="h-4 w-4 shrink-0 text-copperwood transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="mt-2 pr-8 text-sm leading-relaxed text-olive-leaf">{a}</p>
                </details>
              ))}
            </div>
            <p className="mt-6 text-sm text-olive-leaf">
              Want to see it first?{' '}
              <Link href="/pay/demo-booking" className="font-medium text-olive-leaf underline decoration-olive-leaf-400 underline-offset-4 hover:decoration-copperwood">
                Open the live demo
              </Link>
              .
            </p>
          </div>
        </section>

        <section className="px-4 pb-16 pt-16 sm:px-6 sm:pb-20 sm:pt-20">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] bg-blue-cta px-6 py-16 text-center text-white sm:py-20">
            <div
              className="pointer-events-none absolute -right-40 -top-44 h-[28rem] w-[28rem] rounded-full border-[3rem] border-white/10"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-64 -left-40 h-[34rem] w-[34rem] rounded-full border border-white/15"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -left-16 top-0 h-56 w-56 rounded-full bg-blue-300/20 blur-3xl"
              aria-hidden
            />
            <div className="relative mx-auto max-w-3xl">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Create your first payment link in minutes.</h2>
              <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-blue-50">
                Free to use. No credit card required. No payment gateway. Money goes straight to your UPI ID.
              </p>
              <Link
                href="/signup"
                className="mt-7 inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-base font-semibold text-primary-600 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.6)] transition-colors hover:bg-blue-50"
              >
                Create a free payment link <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <p className="mt-4 text-sm text-blue-50">
                Already have an account?{' '}
                <Link href="/login" className="underline underline-offset-4 hover:text-white">
                  Log in
                </Link>
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative overflow-hidden border-t border-white/10 bg-blue-hero">
        <div
          className="pointer-events-none absolute -right-40 -top-48 h-96 w-96 rounded-full border-[2rem] border-sunlit-clay/10"
          aria-hidden
        />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <p className="text-xl font-extrabold tracking-tight text-white">
              Toro<span className="text-sunlit-clay">Pay</span>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-gray-300">
              Free UPI payment links and checkout for Indian businesses. Payments go directly to your UPI ID.
            </p>
          </div>

          <nav className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm text-gray-300 sm:flex sm:flex-wrap" aria-label="Footer">
            <Link href="/features" className="hover:text-sunlit-clay">Features</Link>
            <Link href="/how-payments-work" className="hover:text-sunlit-clay">How payments work</Link>
            <Link href="/pricing" className="hover:text-sunlit-clay">Pricing</Link>
            <Link href="/docs" className="hover:text-sunlit-clay">Docs</Link>
            <Link href="/about" className="hover:text-sunlit-clay">About</Link>
            <Link href="/blog" className="hover:text-sunlit-clay">Blog</Link>
            <Link href="/donate" className="hover:text-sunlit-clay">Support ToroPay</Link>
            <Link href="/terms" className="hover:text-sunlit-clay">Terms</Link>
            <Link href="/privacy" className="hover:text-sunlit-clay">Privacy</Link>
          </nav>
        </div>
        <div className="mx-auto max-w-6xl border-t border-white/10 px-6 py-5 text-sm text-gray-400">
          © {new Date().getFullYear()} ToroPay. Free to use. No transaction fees.
        </div>
      </footer>
    </div>
  )
}
