'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, PackageSearch, Users, ShoppingBag, Truck, Link2, Banknote, QrCode, Palette, Settings, BarChart3, FileStack, HeartHandshake, MessageSquare, LogOut, Menu, X, Globe, Code2, ChevronDown, RotateCcw, Target, Plug
} from 'lucide-react'
import { api } from '@/lib/api'

const mainNav = [
  { label: 'Overview', href: '/dashboard/overview', icon: LayoutDashboard },
  { label: 'Orders', href: '/dashboard/orders', icon: ShoppingBag },
  { label: 'Customers', href: '/dashboard/customers', icon: Users },
  { label: 'Products', href: '/dashboard/products', icon: PackageSearch },
  { label: 'Delivery', href: '/dashboard/delivery', icon: Truck },
  { label: 'Couriers', href: '/dashboard/couriers', icon: Truck },
]

const paymentsNav = [
  { label: 'Checkout Links', href: '/dashboard/payment-links', icon: Link2 },
  { label: 'UPI Links', href: '/dashboard/links', icon: QrCode },
  { label: 'Transactions', href: '/dashboard/transactions', icon: Banknote },
  { label: 'Returns & Refunds', href: '/dashboard/returns', icon: RotateCcw },
  { label: 'UPI IDs', href: '/dashboard/upi', icon: QrCode },
]

const brandNav = [
  { label: 'Branding', href: '/dashboard/branding', icon: Palette },
  { label: 'Templates', href: '/dashboard/templates', icon: FileStack },
  { label: 'Emails', href: '/dashboard/emails', icon: MessageSquare },
  { label: 'Messages', href: '/dashboard/messages', icon: MessageSquare },
  { label: 'Segments', href: '/dashboard/segments', icon: Target },
  { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { label: 'Support', href: '/dashboard/support', icon: HeartHandshake },
]

const devNav = [
  { label: 'Website Integration', href: '/dashboard/website', icon: Globe },
  { label: 'Webhooks', href: '/dashboard/webhooks', icon: Code2 },
  { label: 'Integrations', href: '/dashboard/integrations', icon: Plug },
  { label: 'Developers', href: '/dashboard/developers', icon: Code2 },
]

export function Sidebar() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await api.logout()
    router.push('/login')
  }

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard/overview' && pathname.startsWith(href))

  function NavItem({ label, href, icon: Icon }: { label: string; href: string; icon: typeof LayoutDashboard }) {
    const active = isActive(href)
    return (
      <Link
        href={href}
        onClick={() => setOpen(false)}
        className={cn(
          'flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
          active ? 'bg-charcoal text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-charcoal'
        )}
      >
        <Icon className="h-4 w-4 shrink-0" /> {label}
      </Link>
    )
  }

  function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
      <p className="px-4 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">{children}</p>
    )
  }

  const nav = (
    <>
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
        <Link href="/dashboard/overview" className="text-xl font-extrabold tracking-tight" onClick={() => setOpen(false)}>
          Toro<span className="text-primary-500">Pay</span>
        </Link>
        <button onClick={() => setOpen(false)} className="lg:hidden" aria-label="Close menu">
          <X className="h-5 w-5 text-gray-500" />
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {mainNav.map(item => <NavItem key={item.href} {...item} />)}

        <button className="pointer-events-none hidden w-full"><ChevronDown className="h-4 w-4" /></button>

        <SectionLabel>Payments</SectionLabel>
        {paymentsNav.map(item => <NavItem key={item.href} {...item} />)}

        <SectionLabel>Grow</SectionLabel>
        {brandNav.map(item => <NavItem key={item.href} {...item} />)}

        <SectionLabel>Developers</SectionLabel>
        {devNav.map(item => <NavItem key={item.href} {...item} />)}
      </nav>
      <div className="border-t border-gray-100 p-3">
        <NavItem label="Settings" href="/dashboard/settings" icon={Settings} />
        <button onClick={handleLogout}
          className="mt-1 flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-charcoal">
          <LogOut className="h-4 w-4 shrink-0" /> Log out
        </button>
      </div>
    </>
  )

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-40 rounded-xl border border-gray-200 bg-white p-2.5 shadow-md lg:hidden" aria-label="Open menu">
        <Menu className="h-5 w-5 text-charcoal" />
      </button>

      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} />
      )}

      <aside className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-white/80 backdrop-blur-md transition-transform duration-300 lg:relative lg:translate-x-0 lg:border-r lg:border-gray-200',
        open ? 'translate-x-0' : '-translate-x-full'
      )}>
        {nav}
      </aside>
    </>
  )
}