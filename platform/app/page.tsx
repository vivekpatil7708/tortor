import Link from 'next/link'
import DonateWidget from '@/components/donate-widget'

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'ToroPay',
  url: 'https://toropay.co.in/',
  logo: 'https://toropay.co.in/favicon.svg',
  description: 'Free UPI payment link and hosted checkout page platform for Indian businesses.',
  foundingDate: '2024',
  sameAs: [
    'https://instagram.com/toropay.co.in',
  ],
}

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Is ToroPay really free?',
      acceptedAnswer: { '@type': 'Answer', text: 'Yes, ToroPay is 100% free. There are no paid plans, no transaction fees, no hidden charges. Unlimited payment links and pages.' },
    },
    {
      '@type': 'Question',
      name: 'How do I get paid?',
      acceptedAnswer: { '@type': 'Answer', text: 'Payments go directly to your own UPI ID. ToroPay does not handle or process any funds. Your customers pay you directly via any UPI app.' },
    },
    {
      '@type': 'Question',
      name: 'What can I create with ToroPay?',
      acceptedAnswer: { '@type': 'Answer', text: 'You can create branded hosted checkout pages, shareable payment links, and dynamic QR codes. Customize colors, logo, background image, and button text.' },
    },
    {
      '@type': 'Question',
      name: 'Who is ToroPay for?',
      acceptedAnswer: { '@type': 'Answer', text: 'ToroPay is built for Indian businesses, freelancers, creators, and anyone who needs to accept UPI payments without a website or technical setup.' },
    },
    {
      '@type': 'Question',
      name: 'Do I need a bank account to accept payments?',
      acceptedAnswer: { '@type': 'Answer', text: 'Yes. You need a bank account linked to a UPI ID in India. ToroPay works with any UPI ID from any bank.' },
    },
  ],
}

const baseUrl = 'https://toropay.co.in'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cream to-beige">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="text-2xl font-extrabold tracking-tight">Toro<span className="text-primary-500">Pay</span></div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-charcoal">Log in</Link>
          <Link href="/signup" className="rounded-xl bg-charcoal px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">Get started</Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 pt-24 pb-32 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary-50 px-4 py-1.5 text-sm font-medium text-primary-600">
          Free UPI Payment Pages for India
        </div>
        <h1 className="text-5xl font-extrabold leading-tight tracking-tight sm:text-6xl">
          Your brand, your UPI ID,<br />
          <span className="text-primary-500">your payment pages</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-500">
          Create branded UPI payment links, QR codes, and hosted checkout pages using your own UPI ID.
          100% free — unlimited links, zero transaction fees, no hidden charges.
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
            { n: '1', t: 'Add your UPI ID', d: 'Enter your VPA like yourname@bank. We validate it instantly.' },
            { n: '2', t: 'Create a payment page', d: 'Set amount (fixed or custom), add your logo, pick colors, and brand it your way.' },
            { n: '3', t: 'Share & get paid', d: 'Share the link or QR code. Customers pay via any UPI app. Money goes directly to you.' },
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
            'Custom fields', 'Link expiry & limits', 'Custom button text', 'Color themes & branding',
            'Dashboard analytics', 'Webhook callbacks', 'Payment templates', 'Unlimited everything',
          ].map((f) => (
            <div key={f} className="rounded-xl border border-gray-100 bg-white/40 px-5 py-4 text-sm font-medium backdrop-blur-sm">✓ {f}</div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-32">
        <h2 className="mb-12 text-center text-3xl font-bold tracking-tight">Who is ToroPay for</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {[
            { t: 'Small business owners', d: 'Restaurants, salons, clinics, and local shops can accept UPI payments via a branded checkout page without building a website.' },
            { t: 'Freelancers & creators', d: 'Designers, writers, tutors, and influencers can share a payment link with clients and get paid instantly to their UPI ID.' },
            { t: 'Solopreneurs & coaches', d: 'Fitness trainers, consultants, and course creators can collect payments with custom fields for bookings and notes.' },
            { t: 'Indian startups', d: 'Early-stage businesses can set up payment pages for MVPs, event registrations, or pre-orders without any payment gateway integration.' },
          ].map(({ t, d }) => (
            <div key={t} className="rounded-2xl border border-white/80 bg-white/50 p-6 backdrop-blur-sm">
              <h3 className="mb-2 text-lg font-bold">{t}</h3>
              <p className="text-sm leading-relaxed text-gray-500">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-32">
        <h2 className="mb-12 text-center text-3xl font-bold tracking-tight">Security & trust</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/80 bg-white/50 p-6 backdrop-blur-sm">
            <h3 className="mb-2 text-lg font-bold">Your money, your control</h3>
            <p className="text-sm leading-relaxed text-gray-500">
              ToroPay never handles your payment funds. Every transaction goes directly from your customer to your UPI ID
              through the National Payments Corporation of India (<a href="https://www.npci.org.in/" target="_blank" rel="noopener noreferrer" className="underline hover:text-charcoal">NPCI</a>) network.
              We only facilitate the payment page and link generation.
            </p>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/50 p-6 backdrop-blur-sm">
            <h3 className="mb-2 text-lg font-bold">Built on UPI standards</h3>
            <p className="text-sm leading-relaxed text-gray-500">
              ToroPay follows UPI deep link standards set by the Reserve Bank of India (<a href="https://www.rbi.org.in/Scripts/FAQView.aspx?Id=121" target="_blank" rel="noopener noreferrer" className="underline hover:text-charcoal">RBI UPI guidelines</a>).
              All payment links use standard <code className="rounded bg-gray-100 px-1 text-xs">upi://pay</code> URIs compatible with Google Pay, PhonePe, Paytm, BHIM, and every UPI app.
            </p>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/50 p-6 backdrop-blur-sm">
            <h3 className="mb-2 text-lg font-bold">Data protection</h3>
            <p className="text-sm leading-relaxed text-gray-500">
              Your data is encrypted in transit and at rest. We use <a href="https://vercel.com/security" target="_blank" rel="noopener noreferrer" className="underline hover:text-charcoal">Vercel</a> for hosting and <a href="https://neon.tech/security" target="_blank" rel="noopener noreferrer" className="underline hover:text-charcoal">Neon PostgreSQL</a> for database — both SOC 2 compliant. Sessions are secured with HTTP-only encrypted cookies.
            </p>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/50 p-6 backdrop-blur-sm">
            <h3 className="mb-2 text-lg font-bold">Rate-limited & monitored</h3>
            <p className="text-sm leading-relaxed text-gray-500">
              Login attempts are rate-limited (account locks after 5 failures). All authentication events are logged for audit. We actively monitor for unusual activity to keep the platform safe.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-32">
        <div className="rounded-3xl bg-charcoal px-8 py-16 text-center text-white">
          <h2 className="text-3xl font-bold tracking-tight">Start accepting UPI payments in minutes</h2>
          <p className="mt-3 text-gray-300">Create unlimited payment links, pages, and QR codes. Completely free. No credit card needed.</p>
          <Link href="/signup" className="mt-6 inline-block rounded-xl bg-primary-500 px-8 py-3.5 text-base font-semibold text-white hover:bg-primary-600">Create free account — it's free</Link>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-10">
        <div className="rounded-3xl border border-white/60 bg-white/40 p-8 backdrop-blur-xl sm:p-12">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">Frequently asked questions</h2>
          <div className="mt-8 space-y-4">
            {[
              { q: 'Is ToroPay really free?', a: 'Yes, ToroPay is 100% free. There are no paid plans, no transaction fees, no hidden charges. You get unlimited payment links, pages, and QR codes at no cost.' },
              { q: 'How do I get paid?', a: 'Payments go directly to your own UPI ID. ToroPay does not handle, process, or store any payment funds. Your customers pay you directly via any UPI app — Google Pay, PhonePe, Paytm, BHIM, or any other.' },
              { q: 'What can I create with ToroPay?', a: 'You can create branded hosted checkout pages with your logo and colors, shareable payment links with custom button text, dynamic QR codes with preset amounts, and multi-product order forms with custom fields.' },
              { q: 'Who is ToroPay for?', a: 'ToroPay is built for Indian businesses, freelancers, creators, solopreneurs, coaches, and anyone who needs to accept UPI payments without building a website or writing any code.' },
              { q: 'Do I need a website to use ToroPay?', a: 'No. ToroPay generates a hosted checkout page for you. Just share the link or QR code with your customers. No website, no coding required.' },
              { q: 'Can I customize the checkout page?', a: 'Yes. You can upload your logo, set brand colors, add a background image, change button text, and choose a page theme. The checkout page reflects your brand identity.' },
              { q: 'Which UPI apps are supported?', a: 'All of them. Google Pay, PhonePe, Paytm, BHIM, Amazon Pay, CRED, and any app that supports UPI payments. Your customers can pay using their preferred app.' },
            ].map(({ q, a }) => (
              <details key={q} className="group rounded-xl border border-gray-200 bg-white/60 p-4 backdrop-blur-sm">
                <summary className="cursor-pointer text-sm font-semibold text-charcoal">{q}</summary>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-32">
        <div className="rounded-3xl border border-white/60 bg-white/40 p-8 text-center backdrop-blur-xl sm:p-12">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">About ToroPay</h2>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-gray-500">
            ToroPay is a free, India-focused UPI payment page platform. We believe every business — no matter how small — should be able to accept digital payments with a professional, branded experience. Built by developers who understand the Indian payments ecosystem, ToroPay is designed to be simple, secure, and completely free.
          </p>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-gray-500">
            Have feedback or want to partner? Reach us via our <Link href="/donate" className="underline hover:text-charcoal">support page</Link> or follow us on <a href="https://instagram.com/toropay.co.in" target="_blank" rel="noopener noreferrer" className="underline hover:text-charcoal">Instagram</a>.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-10">
        <div className="rounded-3xl border border-white/60 bg-white/40 p-8 text-center backdrop-blur-xl sm:p-12">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Share ToroPay</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-gray-500">
            Know someone who could use free UPI payment pages? Spread the word.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <a href={`https://wa.me/?text=${encodeURIComponent('ToroPay — Free UPI payment pages for Indian businesses. No fees, no catch. Check it out: ' + baseUrl)}`} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">WhatsApp</a>
            <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent('ToroPay — Free UPI payment pages for Indian businesses. No fees, no catch. ' + baseUrl)}`} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#000] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">X</a>
            <a href={`https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(baseUrl)}&title=ToroPay&summary=${encodeURIComponent('Free UPI payment pages for Indian businesses.')}`} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#0A66C2] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">LinkedIn</a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-32">
        <div className="rounded-3xl border border-white/60 bg-white/40 p-8 backdrop-blur-xl sm:p-12">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl text-center">From the Blog</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-center text-gray-500">Guides, comparisons, and tips for Indian businesses on UPI payments.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <Link href="/blog/best-razorpay-alternatives-for-indian-businesses" className="rounded-xl border border-gray-200 bg-white/60 p-5 hover:bg-white/80 transition-colors">
              <span className="text-xs font-medium text-primary-600">Comparisons</span>
              <h3 className="mt-1 text-sm font-bold text-charcoal">7 Best Razorpay Alternatives for Indian Businesses in 2026</h3>
              <p className="mt-1 text-xs text-gray-400">Compare free payment gateways and UPI solutions.</p>
            </Link>
            <Link href="/blog/free-payment-links-india" className="rounded-xl border border-gray-200 bg-white/60 p-5 hover:bg-white/80 transition-colors">
              <span className="text-xs font-medium text-primary-600">Tutorials</span>
              <h3 className="mt-1 text-sm font-bold text-charcoal">How to Create Free Payment Links in India</h3>
              <p className="mt-1 text-xs text-gray-400">Accept payments instantly with zero transaction fees.</p>
            </Link>
            <Link href="/blog/cashless-payment-solutions-for-small-business" className="rounded-xl border border-gray-200 bg-white/60 p-5 hover:bg-white/80 transition-colors">
              <span className="text-xs font-medium text-primary-600">Guides</span>
              <h3 className="mt-1 text-sm font-bold text-charcoal">Cashless Payment Solutions for Small Businesses</h3>
              <p className="mt-1 text-xs text-gray-400">Complete guide to going cashless in India.</p>
            </Link>
            <Link href="/blog/toropay-vs-instapay-comparison" className="rounded-xl border border-gray-200 bg-white/60 p-5 hover:bg-white/80 transition-colors">
              <span className="text-xs font-medium text-primary-600">Comparisons</span>
              <h3 className="mt-1 text-sm font-bold text-charcoal">ToroPay vs InstaPay: Which Is Better?</h3>
              <p className="mt-1 text-xs text-gray-400">Feature-by-feature comparison of UPI payment solutions.</p>
            </Link>
          </div>
          <div className="mt-6 text-center">
            <Link href="/blog" className="text-sm font-semibold text-primary-500 hover:underline">Read all articles →</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-32">
        <div className="rounded-3xl border border-white/60 bg-white/40 p-8 text-center backdrop-blur-xl sm:p-12">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-2xl">{'❤️'}</div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Support ToroPay</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-gray-500">
            ToroPay is and will always be <strong>completely free</strong> to use. If this platform helps you,
            consider donating to help cover hosting, maintenance, and future improvements.
            Every contribution, no matter how small, makes a difference.
          </p>
          <div className="mt-6 rounded-2xl border border-white/60 bg-white/50 p-6 backdrop-blur-sm">
            <DonateWidget />
          </div>
          <p className="mt-3 text-xs text-gray-400">
            <Link href="/donate" className="underline hover:text-charcoal">Learn more about supporting ToroPay</Link>
          </p>
        </div>
      </section>

      <footer className="border-t border-gray-200 px-6 py-8 text-center text-sm text-gray-400">
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-6">
          <span>ToroPay — Built for Indian businesses</span>
          <Link href="/blog" className="underline hover:text-charcoal">Blog</Link>
          <Link href="/donate" className="underline hover:text-charcoal">Donate</Link>
          <Link href="/terms" className="underline hover:text-charcoal">Terms</Link>
          <Link href="/privacy" className="underline hover:text-charcoal">Privacy</Link>
          <a href="https://instagram.com/toropay.co.in" target="_blank" rel="noopener noreferrer" className="underline hover:text-charcoal">Instagram</a>
        </div>
      </footer>
    </div>
  )
}
