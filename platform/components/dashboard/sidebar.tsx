'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Link2, Banknote, QrCode, Palette, Settings, BarChart3, FileStack, LogOut, Menu, X
} from 'lucide-react'
import { api } from '@/lib/api'

const navItems = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Payment Links', href: '/dashboard/links', icon: Link2 },
  { label: 'Transactions', href: '/dashboard/transactions', icon: Banknote },
  { label: 'UPI IDs', href: '/dashboard/upi', icon: QrCode },
  { label: 'Branding', href: '/dashboard/branding', icon: Palette },
  { label: 'Templates', href: '/dashboard/templates', icon: FileStack },
  { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
]

export function Sidebar() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await api.logout()
    router.push('/login')
  }

  const nav = (
    <>
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
        <Link href="/dashboard" className="text-xl font-extrabold tracking-tight" onClick={() => setOpen(false)}>
          Toro<span className="text-primary-500">Pay</span>
        </Link>
        <button onClick={() => setOpen(false)} className="lg:hidden">
          <X className="h-5 w-5 text-gray-500" />
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link key={href} href={href} onClick={() => setOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
                active ? 'bg-charcoal text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-charcoal'
              )}>
              <Icon className="h-4 w-4 shrink-0" /> {label}
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-gray-100 p-3">
        <button onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-charcoal">
          <LogOut className="h-4 w-4 shrink-0" /> Log out
        </button>
      </div>
    </>
  )

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-40 rounded-xl border border-gray-200 bg-white p-2.5 shadow-md lg:hidden">
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
