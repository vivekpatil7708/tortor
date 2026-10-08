'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Link2, Banknote, QrCode, Palette, Settings, BarChart3, FileStack, HeartHandshake, MessageSquare, Globe, Code2, Truck, Package, LogOut, Menu, Plus, X, ChevronDown
} from 'lucide-react'
import { api } from '@/lib/api'

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard }

// Daily jobs first; developer tools folded away (U16).
export const navGroups: Array<{ title: string; folded?: boolean; items: NavItem[] }> = [
  {
    title: 'Get paid',
    items: [
      { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Payment Links', href: '/dashboard/links', icon: Link2 },
      { label: 'Transactions', href: '/dashboard/transactions', icon: Banknote },
    ],
  },
  {
    title: 'Business',
    items: [
      { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
      { label: 'Messaging', href: '/dashboard/settings/messaging', icon: MessageSquare },
      { label: 'Templates', href: '/dashboard/templates', icon: FileStack },
      { label: 'Delivery', href: '/dashboard/delivery', icon: Truck },
      { label: 'Couriers', href: '/dashboard/couriers', icon: Package },
    ],
  },
  {
    title: 'Setup',
    items: [
      { label: 'UPI IDs', href: '/dashboard/upi', icon: QrCode },
      { label: 'Branding', href: '/dashboard/branding', icon: Palette },
      { label: 'Settings', href: '/dashboard/settings', icon: Settings },
    ],
  },
  {
    title: 'Developers',
    folded: true,
    items: [
      { label: 'Website Integration', href: '/dashboard/website', icon: Globe },
      { label: 'API keys & webhooks', href: '/dashboard/developers', icon: Code2 },
    ],
  },
]

const supportItem: NavItem = { label: 'Support ToroPay', href: '/dashboard/support', icon: HeartHandshake }

/**
 * The menu item for the current page: the longest matching address, so Messaging
 * (/dashboard/settings/messaging) doesn't also light up Settings.
 */
export function activeNavHref(pathname: string, hrefs: string[]): string | null {
  const matches = hrefs.filter(href => pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`)))
  return matches.sort((a, b) => b.length - a.length)[0] ?? null
}

const allHrefs = [...navGroups.flatMap(g => g.items), supportItem].map(i => i.href)

export function Sidebar() {
  const [open, setOpen] = useState(false)
  const [developersOpen, setDevelopersOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const activeHref = activeNavHref(pathname, allHrefs)

  async function handleLogout() {
    await api.logout()
    router.push('/login')
  }

  const navLink = ({ label, href, icon: Icon }: NavItem) => (
    <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={href === activeHref ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-colors',
        href === activeHref ? 'bg-charcoal text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-charcoal'
      )}>
      <Icon className="h-4 w-4 shrink-0" /> {label}
    </Link>
  )

  const nav = (
    <>
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
        <Link href="/dashboard" className="text-xl font-extrabold tracking-tight" onClick={() => setOpen(false)}>
          Toro<span className="text-primary-500">Pay</span>
        </Link>
        <button onClick={() => setOpen(false)} className="lg:hidden" aria-label="Close menu">
          <X className="h-5 w-5 text-gray-500" />
        </button>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-label="Dashboard">
        {navGroups.map(group => {
          // A folded group opens when asked, or when you're on one of its pages.
          const shown = !group.folded || developersOpen || group.items.some(i => i.href === activeHref)
          return (
            <div key={group.title}>
              {group.folded ? (
                <button type="button" onClick={() => setDevelopersOpen(o => !o)} aria-expanded={shown}
                  className="flex w-full items-center justify-between px-4 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-charcoal">
                  {group.title}
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', shown && 'rotate-180')} aria-hidden />
                </button>
              ) : (
                <p className="px-4 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{group.title}</p>
              )}
              {shown && <div className="space-y-0.5">{group.items.map(navLink)}</div>}
            </div>
          )
        })}
      </nav>
      <div className="space-y-0.5 border-t border-gray-100 p-3">
        {navLink(supportItem)}
        <button onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-charcoal">
          <LogOut className="h-4 w-4 shrink-0" /> Log out
        </button>
      </div>
    </>
  )

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Open menu"
        className="fixed left-4 top-4 z-40 rounded-xl border border-gray-200 bg-white p-2.5 shadow-md lg:hidden print:hidden">
        <Menu className="h-5 w-5 text-charcoal" />
      </button>

      {/* Phones: the most common job, one tap away on every page. */}
      {!open && pathname !== '/dashboard/links/new' && (
        <Link href="/dashboard/links/new"
          className="fixed right-4 top-4 z-40 inline-flex items-center gap-1 rounded-xl bg-charcoal px-3 py-2.5 text-xs font-semibold text-white shadow-md lg:hidden print:hidden">
          <Plus className="h-4 w-4" aria-hidden /> New link
        </Link>
      )}

      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} />
      )}

      <aside className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-white/80 backdrop-blur-md transition-transform duration-300 lg:relative lg:translate-x-0 lg:border-r lg:border-gray-200 print:hidden',
        open ? 'translate-x-0' : '-translate-x-full'
      )}>
        {nav}
      </aside>
    </>
  )
}
