'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Link2, Banknote, QrCode, Palette, Settings, BarChart3, FileStack, LogOut
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
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await api.logout()
    router.push('/login')
  }

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-gray-200 bg-white/80 backdrop-blur-md">
      <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-5">
        <Link href="/dashboard" className="text-xl font-extrabold tracking-tight">
          Toro<span className="text-primary-500">Pay</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link key={href} href={href}
              className={cn(
                'flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
                active ? 'bg-charcoal text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-charcoal'
              )}>
              <Icon className="h-4 w-4" /> {label}
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-gray-100 p-3">
        <button onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-charcoal">
          <LogOut className="h-4 w-4" /> Log out
        </button>
      </div>
    </aside>
  )
}
