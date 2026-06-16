'use client'

import { useEffect, useState } from 'react'

interface Txn {
  txn_id: string
  amount: number
  status: string
  customer_name: string | null
  customer_phone: string | null
  merchant_email: string
  merchant_business: string
  created_at: string
}

export default function AdminTransactions() {
  const [txns, setTxns] = useState<Txn[]>([])

  useEffect(() => {
    fetch('/api/admin/transactions').then(r => r.json()).then(d => setTxns(d.transactions || [])).catch(() => {})
  }, [])

  const statusColor: Record<string, string> = {
    success: 'bg-green-50 text-green-700',
    pending: 'bg-amber-50 text-amber-700',
    initiated: 'bg-blue-50 text-blue-700',
    failed: 'bg-red-50 text-red-700',
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Transactions ({txns.length})</h1>

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
            {txns.map(t => (
              <tr key={t.txn_id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-5 py-3 font-mono text-xs">{t.txn_id}</td>
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
            ))}
            {txns.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">No transactions yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
