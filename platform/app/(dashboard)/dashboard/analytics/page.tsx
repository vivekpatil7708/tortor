'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatAmount } from '@/lib/utils'

export default function AnalyticsPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    api.getAnalytics().then(setData).catch(() => {})
  }, [])

  const byStatus = (data?.by_status as Record<string, number>) || {}

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-sm text-gray-500">Track your payment performance.</p>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Revenue', value: formatAmount(Number(data?.total_revenue || 0)), color: 'text-green-600' },
          { label: 'Avg Order', value: formatAmount(Number(data?.avg_order || 0)), color: 'text-blue-600' },
          { label: 'Conversion', value: `${data?.conversion_rate || 0}%`, color: 'text-purple-600' },
          { label: 'Transactions', value: String(data?.total_transactions || 0), color: 'text-charcoal' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
            <span className="text-sm font-medium text-gray-500">{label}</span>
            <p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
          <h2 className="mb-4 font-bold">By Status</h2>
          <div className="space-y-2">
            {Object.entries(byStatus).map(([status, count]) => (
              <div key={status} className="flex justify-between rounded-lg bg-white/50 px-4 py-2 text-sm">
                <span className="capitalize text-gray-500">{status}</span>
                <span className="font-semibold">{count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
          <h2 className="mb-4 font-bold">Recent Successful Payments</h2>
          {!(data?.recent_success as unknown[])?.length ? (
            <p className="text-sm text-gray-400">No successful payments yet.</p>
          ) : (
            <div className="space-y-2">
              {(data?.recent_success as Array<{ txn_id: string; amount: number; created_at: string }>).slice(0, 8).map(t => (
                <div key={t.txn_id} className="flex justify-between rounded-lg bg-white/50 px-4 py-2 text-sm">
                  <span className="font-mono text-xs text-gray-500">{t.txn_id}</span>
                  <span className="font-semibold">{formatAmount(t.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
