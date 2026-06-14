'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatAmount, formatDate, statusColor } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export default function TransactionsPage() {
  const [txns, setTxns] = useState<Record<string, unknown>[]>([])
  const [filter, setFilter] = useState('all')

  function load() {
    api.getTransactions().then(setTxns).catch(() => {})
  }

  useEffect(() => { load() }, [])

  async function updateStatus(txnId: string, status: string) {
    await api.updateTransaction(txnId, { status, merchant_action: true })
    load()
  }

  const filtered = filter === 'all' ? txns : txns.filter(t => t.status === filter)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
        <p className="text-sm text-gray-500">All payment transactions made through your links.</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {['all', 'success', 'pending', 'initiated', 'failed'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${filter === f ? 'bg-charcoal text-white' : 'bg-white/60 text-gray-500 hover:bg-white'}`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/80 bg-white/60 p-12 text-center text-sm text-gray-400 backdrop-blur-sm">No transactions found.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <div key={t.id as string} className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold">{t.txn_id as string}</p>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor(t.status as string)}`}>{t.status as string}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    {(t.customer_name as string) || 'Anonymous'} · {(t.customer_phone as string) || '—'} · {formatDate(t.created_at as string)}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">Settlement: {t.settlement_status as string}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{formatAmount(Number(t.amount))}</p>
                  {(t.status === 'pending' || t.status === 'initiated') && (
                    <div className="mt-2 flex gap-1">
                      <Button size="sm" onClick={() => updateStatus(t.txn_id as string, 'success')}>Confirm</Button>
                      <Button size="sm" variant="danger" onClick={() => updateStatus(t.txn_id as string, 'failed')}>Reject</Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
