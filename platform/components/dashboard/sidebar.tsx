'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { activeNavHref } from '@/lib/nav'
import {
  LayoutDashboard, Link2, Banknote, QrCode, Palette, Settings, BarChart3, FileStack,
  HeartHandshake, MessageSquare, Globe, Code2, Truck, Package, LogOut, Menu, Plus, X,
  ChevronDown, Webhook, Users, ShoppingCart, Tag, RotateCcw, Repeat, Gift, ScrollText,
} from 'lucide-react'
import { api } from '@/lib/api'
import { MobileNav } from './mobile-nav'

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard }
type NavGroup = { id: string; title: string; icon: typeof LayoutDashboard; items: NavItem[] }

// Five destinations, each collapsed until needed. The dashboard stays calm;
// developers and one-off setup live under Settings instead of the main path.
export const navGroups: NavGroup[] = [
  {
    id: 'home',
    title: 'Home',
    icon: LayoutDashboard,
    items: [
      { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
    ],
  },
  {
    id: 'payments',
    title: 'Payments',
    icon: Banknote,
    items: [
      { label: 'Payment Links', href: '/dashboard/links', icon: Link2 },
      { label: 'Transactions', href: '/dashboard/transactions', icon: Banknote },
      { label: 'Orders', href: '/dashboard/orders', icon: ShoppingCart },
      { label: 'Refunds', href: '/dashboard/refunds', icon: RotateCcw },
      { label: 'Subscriptions', href: '/dashboard/subscriptions', icon: Repeat },
    ],
  },
  {
    id: 'sell',
    title: 'Sell',
    icon: Package,
    items: [
      { label: 'Products', href: '/dashboard/products', icon: Package },
      { label: 'Coupons', href: '/dashboard/coupons', icon: Tag },
      { label: 'Delivery', href: '/dashboard/delivery', icon: Truck },
      { label: 'Couriers', href: '/dashboard/couriers', icon: Package },
    ],
  },
  {
    id: 'customers',
    title: 'Customers',
    icon: Users,
    items: [
      { label: 'Customers', href: '/dashboard/customers', icon: Users },
      { label: 'Loyalty', href: '/dashboard/loyalty', icon: Gift },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    icon: Settings,
    items: [
      { label: 'Business profile', href: '/dashboard/settings', icon: Settings },
      { label: 'UPI IDs', href: '/dashboard/upi', icon: QrCode },
      { label: 'Branding', href: '/dashboard/branding', icon: Palette },
      { label: 'Team', href: '/dashboard/settings/team', icon: Users },
      { label: 'Messaging', href: '/dashboard/settings/messaging', icon: MessageSquare },
      { label: 'Templates', href: '/dashboard/templates', icon: FileStack },
      { label: 'Website integration', href: '/dashboard/website', icon: Globe },
      { label: 'API keys & webhooks', href: '/dashboard/developers', icon: Code2 },
      { label: 'Webhooks', href: '/dashboard/webhooks', icon: Webhook },
      { label: 'Webhook logs', href: '/dashboard/developers/webhook-logs', icon: ScrollText },
    ],
  },
]

const supportItem: NavItem = { label: 'Support ToroPay', href: '/dashboard/support', icon: HeartHandshake }

export { activeNavHref }

const allHrefs = [...navGroups.flatMap(g => g.items), supportItem].map(i => i.href)

export function Sidebar() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const activeHref = activeNavHref(pathname, allHrefs)
  const activeGroupId = navGroups.find(g => g.items.some(i => i.href === activeHref))?.id ?? 'home'
  const [openGroups, setOpenGroups] = useState<string[]>([activeGroupId])

  // Follow the page: whatever section you land in opens, without closing the others.
  useEffect(() => {
    setOpenGroups(prev => (prev.includes(activeGroupId) ? prev : [...prev, activeGroupId]))
  }, [activeGroupId])

  async function handleLogout() {
    await api.logout()
    router.push('/login')
  }

  function toggleGroup(id: string) {
    setOpenGroups(prev => (prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]))
  }

  const navLink = ({ label, href, icon: Icon }: NavItem) => {
    const active = href === activeHref
    return (
      <Link
        key={href}
        href={href}
        onClick={() => setOpen(false)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group flex items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunlit-clay/40',
          active ? 'border-sunlit-clay bg-white/10 text-white shadow-sm' : 'border-transparent text-gray-400 hover:bg-white/5 hover:text-white'
        )}
      >
        <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-sunlit-clay' : 'text-gray-500 group-hover:text-sunlit-clay')} aria-hidden />
        <span className="truncate">{label}</span>
      </Link>
    )
  }

  const nav = (
    <>
      <div className="flex items-center justify-between px-5 pb-2 pt-5">
        <Link href="/dashboard" className="text-xl font-extrabold tracking-tight text-white" onClick={() => setOpen(false)}>
          Toro<span className="text-sunlit-clay">Pay</span>
        </Link>
        <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-gray-400 hover:bg-white/10 hover:text-white lg:hidden" aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
      </div>

      <Link
        href="/dashboard/links/new"
        onClick={() => setOpen(false)}
        className="mx-3 mb-3 inline-flex items-center justify-center gap-2 rounded-xl btn-blue-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors"
      >
        <Plus className="h-4 w-4" aria-hidden /> Create payment link
      </Link>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Main">
        {navGroups.map(group => {
          const Icon = group.icon
          const isOpen = openGroups.includes(group.id)
          const hasActive = group.items.some(i => i.href === activeHref)
          return (
            <div key={group.id}>
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={isOpen}
                aria-controls={`nav-group-${group.id}`}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunlit-clay/40',
                  hasActive ? 'text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', hasActive ? 'text-sunlit-clay' : 'text-gray-500')} aria-hidden />
                <span className="flex-1 text-left">{group.title}</span>
                <ChevronDown className={cn('h-4 w-4 text-gray-500 transition-transform', isOpen && 'rotate-180')} aria-hidden />
              </button>
              {isOpen && (
                <div id={`nav-group-${group.id}`} className="mt-0.5 space-y-0.5 pb-1 pl-3">
                  {group.items.map(navLink)}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="space-y-0.5 border-t border-white/10 p-3">
        {navLink(supportItem)}
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-4 w-4 shrink-0 text-gray-500" aria-hidden /> Log out
        </button>
      </div>
    </>
  )

  return (
    <>
      <MobileNav activeHref={activeHref} onMenu={() => setOpen(true)} />

      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col overflow-hidden border-r border-white/10 bg-blue-hero text-white transition-transform duration-300 lg:relative lg:z-auto lg:translate-x-0 print:hidden',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
        aria-label="Dashboard navigation"
      >
        <div
          className="pointer-events-none absolute -bottom-44 -right-32 h-80 w-80 rounded-full border-[2rem] border-sunlit-clay/10"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-24 top-1/3 h-56 w-56 rounded-full bg-sunlit-clay/[0.04] blur-3xl"
          aria-hidden
        />
        {nav}
      </aside>
    </>
  )
}
