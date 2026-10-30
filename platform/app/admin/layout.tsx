import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { hasAdminSecondFactor, isAdminEmail } from '@/lib/admin-auth'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  if (!session || !isAdminEmail(session.accountEmail) || !session.accountEmailVerifiedAt) {
    redirect('/dashboard')
  }
  if (!(await hasAdminSecondFactor(session.accountId))) {
    redirect('/admin-verify')
  }

  return (
    <div className="min-h-screen bg-blue-soft">
      <header className="relative overflow-hidden border-b border-white/10 glass-blue text-white">
        <div
          className="pointer-events-none absolute -right-20 -top-24 h-48 w-48 rounded-full border-[1rem] border-sunlit-clay/10"
          aria-hidden
        />
        <div className="relative mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <span className="text-lg font-extrabold tracking-tight">
              Toro<span className="text-sunlit-clay">Pay</span>
              <span className="ml-2 rounded-full border border-sunlit-clay/20 bg-sunlit-clay/10 px-2 py-0.5 text-xs font-medium text-blue-200">Admin</span>
            </span>
            <nav className="ml-8 flex items-center gap-1 text-sm">
              <a href="/admin" className="rounded-lg px-3 py-1.5 text-gray-300 hover:bg-white/10 hover:text-white">Overview</a>
              <a href="/admin/merchants" className="rounded-lg px-3 py-1.5 text-gray-300 hover:bg-white/10 hover:text-white">Merchants</a>
              <a href="/admin/messaging" className="rounded-lg px-3 py-1.5 text-gray-300 hover:bg-white/10 hover:text-white">Messaging</a>
              <a href="/admin/feedback" className="rounded-lg px-3 py-1.5 text-gray-300 hover:bg-white/10 hover:text-white">Feedback</a>
              <a href="/admin/transactions" className="rounded-lg px-3 py-1.5 text-gray-300 hover:bg-white/10 hover:text-white">Transactions</a>
              <a href="/admin/activity" className="rounded-lg px-3 py-1.5 text-gray-300 hover:bg-white/10 hover:text-white">Activity</a>
            </nav>
          </div>
          <a href="/dashboard" className="text-sm text-gray-400 hover:text-white">Back to app &rarr;</a>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  )
}
