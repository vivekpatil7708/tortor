'use client'

import { useEffect, useState } from 'react'

interface Stats {
  total_merchants: number
  total_transactions: number
  total_revenue: number
  signups_today: number
  revenue_today: number
  active_merchants: number
  recent_signups: Array<{ email: string; business_name: string; created_at: string }>
}

export default function AdminOverview() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    fetch('/api/admin/stats').then(r => r.json()).then(setStats).catch(() => {})
  }, [])

  if (!stats) return <p className="text-sm text-gray-400">Loading...</p>

  const cards = [
    { label: 'Total Merchants', value: stats.total_merchants, color: 'bg-blue-50 text-blue-700' },
    { label: 'Total Transactions', value: stats.total_transactions, color: 'bg-green-50 text-green-700' },
    { label: 'Total Revenue', value: '\u20B9' + stats.total_revenue.toLocaleString('en-IN'), color: 'bg-purple-50 text-purple-700' },
    { label: 'Signups Today', value: stats.signups_today, color: 'bg-amber-50 text-amber-700' },
    { label: 'Revenue Today', value: '\u20B9' + stats.revenue_today.toLocaleString('en-IN'), color: 'bg-emerald-50 text-emerald-700' },
    { label: 'Active Merchants', value: stats.active_merchants, color: 'bg-indigo-50 text-indigo-700' },
  ]

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Overview</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(c => (
          <div key={c.label} className="rounded-2xl border border-gray-200 bg-white p-6">
            <p className="text-sm font-medium text-gray-500">{c.label}</p>
            <p className={`mt-2 text-3xl font-bold ${c.color.split(' ')[1]}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-lg font-bold tracking-tight">Recent Signups</h2>
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-5 py-3 font-semibold text-gray-500">Email</th>
                <th className="px-5 py-3 font-semibold text-gray-500">Business</th>
                <th className="px-5 py-3 font-semibold text-gray-500">Date</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent_signups.map(s => (
                <tr key={s.created_at} className="border-b border-gray-50">
                  <td className="px-5 py-3">{s.email}</td>
                  <td className="px-5 py-3 text-gray-500">{s.business_name}</td>
                  <td className="px-5 py-3 text-gray-400">{new Date(s.created_at).toLocaleDateString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
