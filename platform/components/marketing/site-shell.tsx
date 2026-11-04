import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Shared header/footer for the public content pages (/about, /features,
 * /how-payments-work, /pricing, /docs). The landing page keeps its own
 * interactive header; everything else uses this so the public site stays
 * consistent without duplicating markup.
 */

const NAV = [
  { href: '/features', label: 'Features' },
  { href: '/how-payments-work', label: 'How payments work' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/docs', label: 'Docs' },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' },
]

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 glass-blue">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-4">
        <Link href="/" className="text-xl font-extrabold tracking-tight text-white">
          Toro<span className="text-sunlit-clay">Pay</span>
        </Link>

        <nav className="order-3 flex w-full flex-wrap items-center gap-x-5 gap-y-1 text-sm font-medium text-gray-300 md:order-none md:w-auto" aria-label="Site">
          {NAV.map(item => (
            <Link key={item.href} href={item.href} className="hover:text-white">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-gray-300 hover:bg-white/10 hover:text-white sm:inline-flex">
            Log in
          </Link>
          <Link href="/signup" className="whitespace-nowrap rounded-full btn-blue-gradient px-4 py-2 text-sm font-semibold text-white transition-colors">
            Create free link
          </Link>
        </div>
      </div>
    </header>
  )
}

const FOOTER_GROUPS = [
  {
    title: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/how-payments-work', label: 'How payments work' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/docs', label: 'Documentation' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About ToroPay' },
      { href: '/blog', label: 'Blog' },
      { href: '/donate', label: 'Support ToroPay' },
      { href: '/feedback', label: 'Feedback' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/terms', label: 'Terms' },
      { href: '/privacy', label: 'Privacy' },
    ],
  },
]

export function MarketingFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-blue-hero">
      <div className="pointer-events-none absolute -right-40 -top-48 h-96 w-96 rounded-full border-[2rem] border-sunlit-clay/10" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-6 py-12 sm:grid-cols-2 lg:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div className="max-w-sm">
          <p className="text-xl font-extrabold tracking-tight text-white">
            Toro<span className="text-sunlit-clay">Pay</span>
          </p>
          <p className="mt-3 text-sm leading-relaxed text-gray-300">
            Free UPI payment links and a light checkout for Indian businesses. Payments go directly
            to your own UPI ID - ToroPay never holds your money.
          </p>
        </div>

        {FOOTER_GROUPS.map(group => (
          <nav key={group.title} aria-label={group.title}>
            <p className="text-sm font-semibold text-white">{group.title}</p>
            <ul className="mt-3 space-y-2 text-sm text-gray-300">
              {group.links.map(link => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-sunlit-clay">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mx-auto max-w-6xl border-t border-white/10 px-6 py-5 text-sm text-gray-400">
        © {new Date().getFullYear()} ToroPay. Free to use, with no transaction fees.
      </div>
    </footer>
  )
}

/** Standard page frame: dark header, light content area, dark footer. */
export function MarketingPage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-cornsilk text-black-forest">
      <MarketingHeader />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  )
}

/** A page hero band used by the content pages. */
export function PageHero({ eyebrow, title, intro }: { eyebrow: string; title: string; intro: string }) {
  return (
    <section className="relative overflow-hidden bg-blue-hero px-6 py-16 sm:py-20">
      <div className="pointer-events-none absolute -right-40 -top-48 h-[28rem] w-[28rem] rounded-full border-[2.5rem] border-sunlit-clay/10" aria-hidden />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-64 w-64 rounded-full bg-sunlit-clay/[0.05] blur-3xl" aria-hidden />
      <div className="relative mx-auto max-w-4xl">
        <p className="text-sm font-semibold uppercase tracking-wider text-sunlit-clay">{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-gray-300">{intro}</p>
      </div>
    </section>
  )
}

/** Section wrapper used inside content pages. */
export function Section({ id, children, className = '' }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto max-w-4xl scroll-mt-24 px-6 py-12 sm:py-16 ${className}`}>
      {children}
    </section>
  )
}

export function Prose({ children }: { children: ReactNode }) {
  return <div className="space-y-5 text-[15px] leading-relaxed text-olive-leaf-400">{children}</div>
}
