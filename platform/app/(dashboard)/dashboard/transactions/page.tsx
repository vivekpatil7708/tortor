'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatAmount, formatDate, statusColor } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { exportToCSV } from '@/lib/export-csv'

export default function TransactionsPage() {
  const [txns, setTxns] = useState<Record<string, unknown>[]>([])
  const [filter, setFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function renderOrderDetails(t: Record<string, unknown>) {
    const cfv = t.custom_field_values as Record<string, unknown> | undefined
    if (!cfv) return null
    const products = cfv._selected_products as Array<{ name: string; price: string; category: string }> | undefined
    const note = t.customer_note as string | null
    const otherFields = Object.entries(cfv).filter(([k]) => k !== '_selected_products')
    if (!products && otherFields.length === 0 && !note) return null
    return (
      <div className="mt-3 space-y-2 border-t border-white/20 pt-3">
        {products && products.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold opacity-70">Ordered Products</p>
            {products.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-white/10 px-3 py-1.5 text-xs">
                <span>{p.name}{p.category ? ` (${p.category})` : ''}</span>
                <span className="font-semibold">₹{p.price}</span>
              </div>
            ))}
          </div>
        )}
        {otherFields.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold opacity-70">Custom Fields</p>
            {otherFields.map(([k, v]) => (
              <div key={k} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs">
                <span className="opacity-60">{k}:</span> <span>{String(v)}</span>
              </div>
            ))}
          </div>
        )}
        {note && (
          <div className="rounded-lg bg-white/10 px-3 py-1.5 text-xs">
            <span className="opacity-60">Note:</span> {note}
          </div>
        )}
      </div>
    )
  }

  function load() {
    api.getTransactions().then(setTxns).catch(() => {})
  }

  useEffect(() => { load() }, [])

  async function updateStatus(txnId: string, status: string) {
    await api.updateTransaction(txnId, { status, merchant_action: true })
    load()
  }

  const filtered = txns.filter(t => {
    if (filter !== 'all' && t.status !== filter) return false
    if (fromDate && new Date(t.created_at as string) < new Date(fromDate)) return false
    if (toDate) {
      const end = new Date(toDate)
      end.setHours(23, 59, 59, 999)
      if (new Date(t.created_at as string) > end) return false
    }
    return true
  })

  function handleExport() {
    exportToCSV('toropay-transactions', [
      { key: 'txn_id', label: 'Transaction ID' },
      { key: 'amount', label: 'Amount' },
      { key: 'status', label: 'Status' },
      { key: 'customer_name', label: 'Customer Name' },
      { key: 'customer_phone', label: 'Customer Phone' },
      { key: 'customer_email', label: 'Customer Email' },
      { key: 'upi_txn_id', label: 'UTR Number' },
      { key: 'payment_app', label: 'Payment App' },
      { key: 'payer_vpa', label: 'Payer VPA' },
      { key: 'settlement_status', label: 'Settlement Status' },
      { key: 'settlement_amount', label: 'Settlement Amount' },
      { key: 'error_message', label: 'Error' },
      { key: 'created_at', label: 'Created Date' },
      { key: 'confirmed_at', label: 'Confirmed Date' },
    ], filtered)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
          <p className="text-sm text-gray-500">All payment transactions made through your links.</p>
        </div>
        <button onClick={handleExport} disabled={filtered.length === 0}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold text-charcoal transition-colors hover:bg-gray-50 disabled:opacity-40">
          Export to Excel
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {['all', 'success', 'pending', 'initiated', 'failed'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${filter === f ? 'bg-charcoal text-white' : 'bg-white/60 text-gray-500 hover:bg-white'}`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 outline-none" />
          <span className="text-gray-400">to</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 outline-none" />
          {(fromDate || toDate) && (
            <button onClick={() => { setFromDate(''); setToDate('') }}
              className="text-gray-400 hover:text-charcoal">Clear</button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/80 bg-white/60 p-12 text-center text-sm text-gray-400 backdrop-blur-sm">No transactions found.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => {
            const tid = t.id as string
            const isExpanded = expanded.has(tid)
            const hasDetails = !!(t.custom_field_values && (t.custom_field_values as Record<string, unknown>)._selected_products ||
              (t.custom_field_values && Object.keys(t.custom_field_values as Record<string, unknown>).length > 0) ||
              t.customer_note)
            return (
            <div key={tid} className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold">{(t.customer_name as string) || 'Anonymous'} · {(t.customer_phone as string) || '—'}</p>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor(t.status as string)}`}>{t.status as string}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      {t.txn_id as string} · {formatDate(t.created_at as string)}
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
              {hasDetails && (
                <>
                  <button onClick={() => toggleExpand(tid)}
                    className="mt-2 text-xs font-semibold opacity-60 hover:opacity-100">
                    {isExpanded ? '▲ Hide details' : '▼ View order details'}
                  </button>
                  {isExpanded && renderOrderDetails(t)}
                </>
              )}
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
