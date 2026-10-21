'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoadMore } from '@/components/admin/load-more'
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
  emails_sent: number
}

const PAGE_SIZE = 50

export default function AdminMerchants() {
  const router = useRouter()
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [accessing, setAccessing] = useState<string | null>(null)

  // The search runs on the server, so merchants past the first page can be
  // found too.
  const load = useCallback(
    async (nextCursor?: string | null) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
        if (nextCursor) params.set('cursor', nextCursor)
        if (appliedSearch) params.set('q', appliedSearch)
        const res = await fetch(`/api/admin/merchants?${params}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not load merchants')
        setMerchants(prev => (nextCursor ? [...prev, ...(data.merchants ?? [])] : (data.merchants ?? [])))
        setCursor(data.next_cursor ?? null)
      } catch {
        setMerchants([])
      } finally {
        setLoading(false)
      }
    },
    [appliedSearch]
  )

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (search === appliedSearch) return
    const timer = setTimeout(() => setAppliedSearch(search), 500)
    return () => clearTimeout(timer)
  }, [search, appliedSearch])

  function handleExport() {
    exportToCSV('toropay-merchants', [
      { key: 'email', label: 'Email' },
      { key: 'business_name', label: 'Business Name' },
      { key: 'phone', label: 'Phone' },
      { key: 'status', label: 'Status' },
      { key: 'onboarding_complete', label: 'Onboarding Complete' },
      { key: 'transaction_count', label: 'Transactions' },
      { key: 'emails_sent', label: 'Emails Sent' },
      { key: 'revenue', label: 'Revenue' },
      { key: 'created_at', label: 'Joined Date' },
    ], merchants)
  }

  async function handleAccess(id: string) {
    setAccessing(id)
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId: id }),
      })
      if (!res.ok) {
        alert('Could not open merchant dashboard')
        return
      }
      router.push('/dashboard')
    } finally {
      setAccessing(null)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Merchants</h1>
        <div className="flex items-center gap-3">
          <input type="text" placeholder="Search merchants..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-64 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none focus:border-gray-400" />
          <button onClick={() => router.push('/admin/messaging')}
            className="rounded-xl bg-[#7bb86c] px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90">
            Send Email to Merchants
          </button>
          <button onClick={handleExport} disabled={merchants.length === 0}
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
              <th className="px-5 py-3 font-semibold text-gray-500">Emails</th>
              <th className="px-5 py-3 font-semibold text-gray-500">Revenue</th>
              <th className="px-5 py-3 font-semibold text-gray-500">Joined</th>
              <th className="px-5 py-3 font-semibold text-gray-500"></th>
            </tr>
          </thead>
          <tbody>
            {merchants.map(m => (
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
                <td className="px-5 py-3">{m.emails_sent}</td>
                <td className="px-5 py-3 font-medium">{'\u20B9'}{m.revenue.toLocaleString('en-IN')}</td>
                <td className="px-5 py-3 text-gray-400">{new Date(m.created_at).toLocaleDateString('en-IN')}</td>
                <td className="px-5 py-3">
                  <button onClick={() => handleAccess(m.id)} disabled={accessing === m.id}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-40">
                    {accessing === m.id ? 'Opening...' : 'Access dashboard'}
                  </button>
                </td>
              </tr>
            ))}
            {merchants.length === 0 && !loading && (
              <tr><td colSpan={9} className="px-5 py-8 text-center text-gray-400">No merchants found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <LoadMore cursor={cursor} onLoad={() => load(cursor)} loading={loading} className="mt-4" />
    </div>
  )
}
