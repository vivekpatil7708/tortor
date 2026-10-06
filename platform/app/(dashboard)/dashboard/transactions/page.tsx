'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { fetchAllTransactions } from '@/lib/api'
import { useTransactionPages } from '@/lib/use-transaction-pages'
import { exportToCSV } from '@/lib/export-csv'
import { STATUS_FILTERS } from '@/lib/payment-status'
import SendConfirmationModal from '@/components/dashboard/send-confirmation-modal'
import { useStatusAction } from '@/components/dashboard/status-action'
import { TransactionRow } from '@/components/dashboard/transaction-row'

const FILTER_VALUES = new Set<string>(STATUS_FILTERS.map(f => f.value))
/** The longest search the server accepts. */
const MAX_SEARCH = 64

export default function TransactionsPage() {
  // "View all" on Overview opens this page on one status (?status=pending).
  const requested = useSearchParams().get('status')
  const [filter, setFilter] = useState(requested && FILTER_VALUES.has(requested) ? requested : 'all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  // Search once typing pauses, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])
  // Filters and search run on the server over every transaction; dates are Indian calendar days.
  const filters = {
    status: filter === 'all' ? undefined : filter,
    from: fromDate || undefined,
    to: toDate || undefined,
    q: query || undefined,
  }
  const { rows: txns, total, loading, error: loadError, hasMore, loadMore, reload, replaceRow, removeRow } = useTransactionPages(filters)
  const [exporting, setExporting] = useState('')
  const [exportError, setExportError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sendTxn, setSendTxn] = useState<Record<string, any> | null>(null)
  const statusAction = useStatusAction(transaction => {
    // Update the row where it is, so the list keeps its place. It leaves a status filter it no longer matches.
    if (filter !== 'all' && transaction.status !== filter) removeRow(transaction.id)
    else replaceRow(transaction)
  })

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
    const products = cfv._selected_products as Array<{ name: string; price: string; category: string; quantity?: number }> | undefined
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
                <span>{p.name}{p.category ? ` (${p.category})` : ''}{p.quantity && p.quantity > 1 ? ` × ${p.quantity}` : ''}</span>
                <span className="font-semibold">₹{Number(p.price) * (p.quantity || 1)}</span>
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

  async function handleExport() {
    if (exporting) return
    setExportError('')
    setExporting('Preparing…')
    try {
      // Every transaction matching the filters, not only the ones loaded on screen.
      const all = await fetchAllTransactions(filters, (loaded, count) =>
        setExporting(`Preparing ${loaded}${count ? ` of ${count}` : ''}…`))
      exportCsv(all)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not export')
    } finally {
      setExporting('')
    }
  }

  function exportCsv(rows: Record<string, unknown>[]) {
    exportToCSV('toropay-transactions', [
      { key: 'txn_id', label: 'Transaction ID' },
      { key: 'amount', label: 'Amount' },
      { key: 'status', label: 'Status' },
      { key: 'customer_name', label: 'Customer Name' },
      { key: 'customer_phone', label: 'Customer Phone' },
      { key: 'customer_email', label: 'Customer Email' },
      { key: 'customer_note', label: 'Customer Note' },
      { key: 'upi_txn_id', label: 'UTR Number' },
      { key: 'payment_app', label: 'Payment App' },
      { key: 'payer_vpa', label: 'Payer VPA' },
      { key: 'settlement_status', label: 'Settlement Status' },
      { key: 'settlement_amount', label: 'Settlement Amount' },
      { key: 'error_message', label: 'Error' },
      { key: 'created_at', label: 'Created Date' },
      { key: 'confirmed_at', label: 'Confirmed Date' },
    ], rows)
  }

  return (
    <div>
      <div data-tour="tour-transactions" className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
          <p className="text-sm text-gray-500">All payment transactions made through your links.</p>
        </div>
        <button onClick={handleExport} disabled={!total || !!exporting}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold text-charcoal transition-colors hover:bg-gray-50 disabled:opacity-40">
          {exporting || 'Export to Excel'}
        </button>
      </div>
      {exportError && <p className="mb-4 text-sm text-red-500">Export failed: {exportError}</p>}

      <div className="relative mb-3 w-full sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
        <input type="search" value={search} maxLength={MAX_SEARCH} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, phone or reference" aria-label="Search payments by name, phone or reference"
          className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)} aria-pressed={filter === f.value}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${filter === f.value ? 'bg-charcoal text-white' : 'bg-white/60 text-gray-500 hover:bg-white'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} aria-label="From date"
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 outline-none" />
          <span className="text-gray-400">to</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} aria-label="To date"
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 outline-none" />
          {(fromDate || toDate) && (
            <button onClick={() => { setFromDate(''); setToDate('') }}
              className="text-gray-400 hover:text-charcoal">Clear</button>
          )}
        </div>
      </div>

      {total !== null && txns.length > 0 && (
        <p className="mb-2 text-xs text-gray-400">Showing {txns.length} of {total}</p>
      )}

      {txns.length === 0 ? (
        <div className="rounded-2xl border border-white/80 bg-white/60 p-12 text-center text-sm text-gray-400 backdrop-blur-sm">
          {loadError ? (
            <>Couldn&apos;t load transactions. <button onClick={reload} className="font-semibold text-charcoal underline">Retry</button></>
          ) : loading ? 'Loading…' : query ? `No payments match "${query}".` : 'No transactions found.'}
        </div>
      ) : (
        <div className="space-y-2">
          {txns.map((t) => {
            const tid = t.id as string
            const isExpanded = expanded.has(tid)
            const hasDetails = !!(t.custom_field_values && (t.custom_field_values as Record<string, unknown>)._selected_products ||
              (t.custom_field_values && Object.keys(t.custom_field_values as Record<string, unknown>).length > 0) ||
              t.customer_note)
            return (
              <TransactionRow key={tid} txn={t} onAction={statusAction.ask} onSend={row => setSendTxn(row as Record<string, any>)}>
                {hasDetails && (
                  <>
                    <button onClick={() => toggleExpand(tid)}
                      className="mt-2 text-xs font-semibold opacity-60 hover:opacity-100">
                      {isExpanded ? '▲ Hide details' : '▼ View order details'}
                    </button>
                    {isExpanded && renderOrderDetails(t)}
                  </>
                )}
              </TransactionRow>
            )
          })}
        </div>
      )}

      {txns.length > 0 && hasMore && (
        <div className="mt-4 text-center">
          {loadError && <p className="mb-2 text-xs text-red-500">Couldn&apos;t load more transactions.</p>}
          <button onClick={loadMore} disabled={loading}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold text-charcoal hover:bg-gray-50 disabled:opacity-40">
            {loading ? 'Loading…' : loadError ? 'Retry' : 'Load more'}
          </button>
        </div>
      )}

      {sendTxn && <SendConfirmationModal txn={sendTxn} onClose={() => setSendTxn(null)} onSent={() => { setSendTxn(null); reload() }} />}
      {statusAction.dialog}
    </div>
  )
}
