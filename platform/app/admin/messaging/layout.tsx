'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/admin/messaging', label: 'Compose' },
  { href: '/admin/messaging/campaigns', label: 'Campaigns' },
  { href: '/admin/messaging/templates', label: 'Templates' },
  { href: '/admin/messaging/logs', label: 'Delivery log' },
]

export default function AdminMessagingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div>
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map(tab => {
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
                active
                  ? 'border-charcoal text-charcoal'
                  : 'border-transparent text-gray-500 hover:border-gray-200 hover:text-charcoal'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
      {children}
    </div>
  )
}
