import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  const adminEmail = process.env.ADMIN_EMAIL

  if (!session || !adminEmail || session.email !== adminEmail) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <span className="text-lg font-extrabold tracking-tight">
              Toro<span className="text-primary-500">Pay</span>
              <span className="ml-2 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Admin</span>
            </span>
            <nav className="ml-8 flex items-center gap-1 text-sm">
              <a href="/admin" className="rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100 hover:text-charcoal">Overview</a>
              <a href="/admin/merchants" className="rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100 hover:text-charcoal">Merchants</a>
              <a href="/admin/transactions" className="rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100 hover:text-charcoal">Transactions</a>
              <a href="/admin/activity" className="rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100 hover:text-charcoal">Activity</a>
            </nav>
          </div>
          <a href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600">Back to app &rarr;</a>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  )
}
