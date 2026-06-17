'use client'

import { useEffect, useState } from 'react'
import { exportToCSV } from '@/lib/export-csv'

interface Merchant {
  id: string
  email: string
  phone: string
  business_name: string
  status: string
  onboarding_complete: boolean
  created_at: string
  transaction_count: number
  revenue: number
}

export default function AdminMerchants() {
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/admin/merchants').then(r => r.json()).then(d => setMerchants(d.merchants || [])).catch(() => {})
  }, [])

  const filtered = merchants.filter(m =>
    m.email.toLowerCase().includes(search.toLowerCase()) ||
    m.business_name.toLowerCase().includes(search.toLowerCase()) ||
    m.phone.includes(search)
  )

  function handleExport() {
    exportToCSV('toropay-merchants', [
      { key: 'email', label: 'Email' },
      { key: 'business_name', label: 'Business Name' },
      { key: 'phone', label: 'Phone' },
      { key: 'status', label: 'Status' },
      { key: 'onboarding_complete', label: 'Onboarding Complete' },
      { key: 'transaction_count', label: 'Transactions' },
      { key: 'revenue', label: 'Revenue' },
      { key: 'created_at', label: 'Joined Date' },
    ], filtered)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Merchants ({merchants.length})</h1>
        <div className="flex items-center gap-3">
          <input type="text" placeholder="Search merchants..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-64 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none focus:border-gray-400" />
          <button onClick={handleExport} disabled={filtered.length === 0}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-charcoal transition-colors hover:bg-gray-50 disabled:opacity-40">
            Export to Excel
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr>
              <th className="px-5 py-3 font-semibold text-gray-500">Email</th>
              <th className="px-5 py-3 font-semibold text-gray-500">Business</th>
              <th className="px-5 py-3 font-semibold text-gray-500">Phone</th>
              <th className="px-5 py-3 font-semibold text-gray-500">Status</th>
              <th className="px-5 py-3 font-semibold text-gray-500">Txns</th>
              <th className="px-5 py-3 font-semibold text-gray-500">Revenue</th>
              <th className="px-5 py-3 font-semibold text-gray-500">Joined</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => (
              <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-5 py-3 font-medium">{m.email}</td>
                <td className="px-5 py-3 text-gray-500">{m.business_name}</td>
                <td className="px-5 py-3 text-gray-500">{m.phone}</td>
                <td className="px-5 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {m.status}
                  </span>
                </td>
                <td className="px-5 py-3">{m.transaction_count}</td>
                <td className="px-5 py-3 font-medium">{'\u20B9'}{m.revenue.toLocaleString('en-IN')}</td>
                <td className="px-5 py-3 text-gray-400">{new Date(m.created_at).toLocaleDateString('en-IN')}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">No merchants found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
