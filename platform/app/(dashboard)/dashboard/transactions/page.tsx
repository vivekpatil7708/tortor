'use client'

import { useState } from 'react'
import { api, fetchAllTransactions } from '@/lib/api'
import { useTransactionPages } from '@/lib/use-transaction-pages'
import { formatAmount, formatDate, statusColor } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { exportToCSV } from '@/lib/export-csv'
import { CONFIRM_UNDO_MINUTES } from '@/lib/payment-transitions'
import { Send } from 'lucide-react'
import SendConfirmationModal from '@/components/dashboard/send-confirmation-modal'

type StatusAction = { txn: Record<string, unknown>; status: 'success' | 'failed'; undo?: boolean }

/** A confirmation can be undone for a short while, in case it was a mistake. */
function canUndo(txn: Record<string, unknown>): boolean {
  if (txn.status !== 'success' || !txn.confirmed_at) return false
  return Date.now() - new Date(txn.confirmed_at as string).getTime() < CONFIRM_UNDO_MINUTES * 60_000
}

function actionMessage({ txn, status, undo }: StatusAction): string {
  const amount = formatAmount(Number(txn.amount))
  const customer = (txn.customer_name as string) || 'this customer'
  if (undo) {
    return `Mark ${amount} from ${customer} as not received? Use this only if you confirmed it by mistake. If this link sends updates to your website, it will be told the payment failed.`
  }
  if (status === 'failed') {
    return `Mark ${amount} from ${customer} as failed? Do this only if the money did not arrive.`
  }
  const notDeclared = txn.status === 'initiated'
    ? ' The customer has NOT marked this payment as sent.'
    : ''
  return `Only confirm if ${amount} from ${customer} has reached your bank or UPI app.${notDeclared}`
}

export default function TransactionsPage() {
  const [filter, setFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  // Filters run on the server over every transaction; dates are Indian calendar days.
  const filters = { status: filter === 'all' ? undefined : filter, from: fromDate || undefined, to: toDate || undefined }
  const { rows: txns, total, loading, error: loadError, hasMore, loadMore, reload, replaceRow, removeRow } = useTransactionPages(filters)
  const [exporting, setExporting] = useState('')
  const [exportError, setExportError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sendTxn, setSendTxn] = useState<Record<string, any> | null>(null)
  const [pendingAction, setPendingAction] = useState<StatusAction | null>(null)
  const [updating, setUpdating] = useState(false)
  const [actionError, setActionError] = useState('')

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

  function askStatus(txn: Record<string, unknown>, status: StatusAction['status'], undo = false) {
    setActionError('')
    setPendingAction({ txn, status, undo })
  }

  async function applyStatus() {
    if (!pendingAction || updating) return
    setUpdating(true)
    setActionError('')
    try {
      const { transaction } = await api.updateTransaction(pendingAction.txn.txn_id as string, { status: pendingAction.status, merchant_action: true })
      setPendingAction(null)
      // Update the row where it is, so the list keeps its place. It leaves a status filter it no longer matches.
      if (filter !== 'all' && transaction.status !== filter) removeRow(transaction.id)
      else replaceRow(transaction)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update the payment')
    } finally {
      setUpdating(false)
    }
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
      <div data-tour="tour-transactions" className="mb-6 flex items-center justify-between">
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

      {total !== null && txns.length > 0 && (
        <p className="mb-2 text-xs text-gray-400">Showing {txns.length} of {total}</p>
      )}

      {txns.length === 0 ? (
        <div className="rounded-2xl border border-white/80 bg-white/60 p-12 text-center text-sm text-gray-400 backdrop-blur-sm">
          {loadError ? (
            <>Couldn&apos;t load transactions. <button onClick={reload} className="font-semibold text-charcoal underline">Retry</button></>
          ) : loading ? 'Loading…' : 'No transactions found.'}
        </div>
      ) : (
        <div className="space-y-2">
          {txns.map((t) => {
            const tid = t.id as string
            const txnId = t.txn_id as string
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
                      {txnId} · {formatDate(t.created_at as string)}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">Settlement: {t.settlement_status as string}</p>
                  </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{formatAmount(Number(t.amount))}</p>
                  <div className="mt-2 flex gap-1">
                    {(t.status === 'success' || t.status === 'pending') && (
                      <button onClick={() => setSendTxn(t as Record<string, any>)}
                        className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-charcoal hover:bg-gray-50">
                        <Send className="h-3 w-3" /> Send
                      </button>
                    )}
                    {(t.status === 'pending' || t.status === 'initiated') && (
                      <>
                        <Button size="sm" onClick={() => askStatus(t, 'success')}>Confirm</Button>
                        <Button size="sm" variant="danger" onClick={() => askStatus(t, 'failed')}>Reject</Button>
                      </>
                    )}
                    {canUndo(t) && (
                      <Button size="sm" variant="danger" onClick={() => askStatus(t, 'failed', true)}>Undo</Button>
                    )}
                  </div>
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
      {pendingAction && (
        <ConfirmDialog
          open
          onClose={() => { if (!updating) setPendingAction(null) }}
          onConfirm={applyStatus}
          title={pendingAction.undo ? 'Undo confirmation?' : pendingAction.status === 'success' ? 'Confirm payment?' : 'Reject payment?'}
          message={actionMessage(pendingAction) + (actionError ? ` Error: ${actionError}` : '')}
          confirmLabel={pendingAction.undo ? 'Undo confirmation' : pendingAction.status === 'success' ? 'Yes, I received it' : 'Reject payment'}
          danger={pendingAction.status === 'failed'}
          busy={updating}
        />
      )}
    </div>
  )
}
