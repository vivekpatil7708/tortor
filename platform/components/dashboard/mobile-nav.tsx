'use client'

import Link from 'next/link'
import { Banknote, Home, Link2, Menu, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

type PrimaryItem = {
  label: string
  href: string
  icon: typeof Home
  matches: string[]
}

// One tap for the two daily jobs, a clear way to create, and everything else
// behind More. The full drawer still exists, but most people never need it.
const primary: PrimaryItem[] = [
  { label: 'Home', href: '/dashboard', icon: Home, matches: ['/dashboard', '/dashboard/analytics'] },
  { label: 'Links', href: '/dashboard/links', icon: Link2, matches: ['/dashboard/links'] },
  { label: 'Create', href: '/dashboard/links/new', icon: Plus, matches: ['/dashboard/links/new'] },
  { label: 'Payments', href: '/dashboard/transactions', icon: Banknote, matches: ['/dashboard/transactions', '/dashboard/orders', '/dashboard/refunds', '/dashboard/subscriptions'] },
]

function isActive(item: PrimaryItem, activeHref: string | null) {
  return !!activeHref && item.matches.includes(activeHref)
}

export function MobileNav({ activeHref, onMenu }: { activeHref: string | null; onMenu: () => void }) {
  const moreActive = !activeHref || !primary.some(item => isActive(item, activeHref))

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-white/10 glass-blue px-4 text-white lg:hidden print:hidden">
        <Link href="/dashboard" className="text-lg font-extrabold tracking-tight">
          Toro<span className="text-sunlit-clay">Pay</span>
        </Link>
        <button
          type="button"
          onClick={onMenu}
          aria-label="Open menu"
          className="rounded-xl border border-white/10 bg-white/5 p-2 text-white transition-colors hover:bg-white/10"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      </header>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 overflow-hidden border-t border-white/10 glass-blue pb-[env(safe-area-inset-bottom)] text-white lg:hidden print:hidden"
      >
        <div
          className="pointer-events-none absolute -top-16 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full bg-sunlit-clay/10 blur-2xl"
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-md grid-cols-5">
          {primary.map(item => {
            const Icon = item.icon
            const active = isActive(item, activeHref)
            const create = item.label === 'Create'
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[58px] flex-col items-center justify-center gap-1 px-1 pb-1.5 pt-2 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunlit-clay/40',
                  active ? 'text-white' : 'text-gray-300 hover:text-white'
                )}
              >
                {create ? (
                  <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full btn-blue-gradient shadow-lg ring-4 ring-ink">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                ) : (
                  <Icon className={cn('h-5 w-5', active && 'text-sunlit-clay')} aria-hidden />
                )}
                <span>{item.label}</span>
              </Link>
            )
          })}

          <button
            type="button"
            onClick={onMenu}
            aria-label="Open more navigation"
            aria-current={moreActive ? 'page' : undefined}
            className={cn(
              'flex min-h-[58px] flex-col items-center justify-center gap-1 px-1 pb-1.5 pt-2 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunlit-clay/40',
              moreActive ? 'text-white' : 'text-gray-400 hover:text-white'
            )}
          >
            <Menu className={cn('h-5 w-5', moreActive && 'text-sunlit-clay')} aria-hidden />
            <span>More</span>
          </button>
        </div>
      </nav>
    </>
  )
}
