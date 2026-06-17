'use client'

import { useEffect, useState } from 'react'
import { exportToCSV } from '@/lib/export-csv'

interface Txn {
  txn_id: string
  amount: number
  status: string
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  customer_note: string | null
  custom_field_values: Record<string, unknown> | null
  merchant_email: string
  merchant_business: string
  created_at: string
}

export default function AdminTransactions() {
  const [txns, setTxns] = useState<Txn[]>([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  useEffect(() => {
    fetch('/api/admin/transactions').then(r => r.json()).then(d => setTxns(d.transactions || [])).catch(() => {})
  }, [])

  const filtered = txns.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    if (fromDate && new Date(t.created_at) < new Date(fromDate)) return false
    if (toDate) {
      const end = new Date(toDate)
      end.setHours(23, 59, 59, 999)
      if (new Date(t.created_at) > end) return false
    }
    if (search && !t.merchant_email.toLowerCase().includes(search.toLowerCase()) &&
      !t.merchant_business.toLowerCase().includes(search.toLowerCase()) &&
      !(t.customer_name || '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  function handleExport() {
    exportToCSV('toropay-admin-transactions', [
      { key: 'txn_id', label: 'Transaction ID' },
      { key: 'amount', label: 'Amount' },
      { key: 'status', label: 'Status' },
      { key: 'customer_name', label: 'Customer Name' },
      { key: 'customer_phone', label: 'Customer Phone' },
      { key: 'customer_email', label: 'Customer Email' },
      { key: 'customer_note', label: 'Customer Note' },
      { key: 'merchant_email', label: 'Merchant Email' },
      { key: 'merchant_business', label: 'Merchant Business' },
      { key: 'created_at', label: 'Date' },
    ], filtered)
  }

  const statusColor: Record<string, string> = {
    success: 'bg-green-50 text-green-700',
    pending: 'bg-amber-50 text-amber-700',
    initiated: 'bg-blue-50 text-blue-700',
    failed: 'bg-red-50 text-red-700',
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Transactions ({txns.length})</h1>
        <button onClick={handleExport} disabled={filtered.length === 0}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-charcoal transition-colors hover:bg-gray-50 disabled:opacity-40">
          Export to Excel
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {['all', 'success', 'pending', 'initiated', 'failed'].map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${statusFilter === f ? 'bg-charcoal text-white' : 'bg-white/60 text-gray-500 hover:bg-white'}`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <input type="text" placeholder="Search merchant or customer..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-56 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-gray-400" />
        <div className="flex items-center gap-2 text-xs">
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 outline-none" />
          <span className="text-gray-400">to</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 outline-none" />
          {(fromDate || toDate || search) && (
            <button onClick={() => { setFromDate(''); setToDate(''); setSearch(''); setStatusFilter('all') }}
              className="text-gray-400 hover:text-charcoal">Clear</button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr>
              <th className="px-5 py-3 font-semibold text-gray-500">Txn ID</th>
              <th className="px-5 py-3 font-semibold text-gray-500">Amount</th>
              <th className="px-5 py-3 font-semibold text-gray-500">Status</th>
              <th className="px-5 py-3 font-semibold text-gray-500">Customer</th>
              <th className="px-5 py-3 font-semibold text-gray-500">Merchant</th>
              <th className="px-5 py-3 font-semibold text-gray-500">Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.flatMap(t => {
              const isExpanded = expanded.has(t.txn_id)
              const cfv = t.custom_field_values
              const products = cfv?._selected_products as Array<{ name: string; price: string; category: string }> | undefined
              const otherFields = Object.entries(cfv || {}).filter(([k]) => k !== '_selected_products')
              const hasDetails = !!products?.length || !!otherFields.length || !!t.customer_note
              const rows: JSX.Element[] = [
              <tr key={t.txn_id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-5 py-3">
                  <span className="font-mono text-xs">{t.txn_id}</span>
                  {hasDetails && (
                    <button onClick={() => toggleExpand(t.txn_id)}
                      className="ml-2 text-xs text-gray-400 hover:text-charcoal">
                      {isExpanded ? '▲' : '▼'}
                    </button>
                  )}
                </td>
                <td className="px-5 py-3 font-medium">{'\u20B9'}{t.amount.toLocaleString('en-IN')}</td>
                <td className="px-5 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[t.status] || 'bg-gray-50 text-gray-700'}`}>
                    {t.status}
                  </span>
                </td>
                <td className="px-5 py-3">
                  {t.customer_name || '—'}<br />
                  <span className="text-xs text-gray-400">{t.customer_phone || ''}</span>
                </td>
                <td className="px-5 py-3">
                  <span className="font-medium">{t.merchant_email}</span>
                  <br /><span className="text-xs text-gray-400">{t.merchant_business}</span>
                </td>
                <td className="px-5 py-3 text-gray-400">{new Date(t.created_at).toLocaleDateString('en-IN')}</td>
              </tr>
              ]
              if (isExpanded && hasDetails) {
                rows.push(
                  <tr key={`${t.txn_id}-details`}>
                    <td colSpan={6} className="bg-gray-50 px-5 py-3">
                      <div className="space-y-2 text-xs">
                        {products && products.length > 0 && (
                          <div>
                            <p className="mb-1 font-semibold text-gray-500">Ordered Products</p>
                            {products.map((p, i) => (
                              <div key={i} className="flex items-center justify-between rounded bg-white px-3 py-1.5">
                                <span>{p.name}{p.category ? ` (${p.category})` : ''}</span>
                                <span className="font-medium">₹{p.price}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {otherFields.length > 0 && (
                          <div>
                            <p className="mb-1 font-semibold text-gray-500">Custom Fields</p>
                            {otherFields.map(([k, v]) => (
                              <div key={k} className="rounded bg-white px-3 py-1.5">
                                <span className="text-gray-400">{k}:</span> {String(v)}
                              </div>
                            ))}
                          </div>
                        )}
                        {t.customer_note && (
                          <div className="rounded bg-white px-3 py-1.5">
                            <span className="text-gray-400">Note:</span> {t.customer_note}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              }
              return rows
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">No transactions yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
