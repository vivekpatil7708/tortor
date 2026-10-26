'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDateTime, formatMoney } from '@/lib/ui-format'

type Refund = Record<string, unknown>
type SourceOption = {
  key: string
  label: string
  amount: number
  orderId?: string
  transactionId?: string
}

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'processed', label: 'Processed' },
] as const

export default function RefundsPage() {
  const [refunds, setRefunds] = useState<Refund[]>([])
  const [pendingTotal, setPendingTotal] = useState(0)
  const [processedTotal, setProcessedTotal] = useState(0)
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [sources, setSources] = useState<SourceOption[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(true)
  const [sourceKey, setSourceKey] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')

  const [toProcess, setToProcess] = useState<Refund | null>(null)
  const [processing, setProcessing] = useState(false)

  const loadRefunds = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const data = await api.getRefunds(filter ? (filter as 'pending' | 'processed') : undefined)
      setRefunds(data.refunds)
      setPendingTotal(data.total_pending)
      setProcessedTotal(data.total_processed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load refunds')
    } finally {
      setLoading(false)
    }
  }, [filter])

  const loadSources = useCallback(async () => {
    try {
      setSourcesLoading(true)
      const [orders, transactions] = await Promise.all([
        api.orders({ limit: 200 }),
        api.getTransactions({ status: 'success', limit: 200 }),
      ])

      const orderOptions: SourceOption[] = orders.orders
        .filter(order => ['paid', 'partially_refunded'].includes(String(order.payment_status)))
        .map(order => {
          const customer = order.customer as Record<string, unknown> | null
          const reference = String(order.order_number ?? 'Order')
          return {
            key: `order:${String(order.id)}`,
            label: `${reference} - ${String(customer?.full_name ?? 'Guest')} - ${formatMoney(Number(order.total_amount))}`,
            amount: Number(order.total_amount),
            orderId: String(order.id),
          }
        })

      const transactionOptions: SourceOption[] = transactions.transactions.map(txn => ({
        key: `txn:${String(txn.id)}`,
        label: `${String(txn.txn_id ?? 'Payment')} - ${String(txn.customer_name ?? 'Customer')} - ${formatMoney(Number(txn.amount))}`,
        amount: Number(txn.amount),
        transactionId: String(txn.id),
      }))

      setSources([...orderOptions, ...transactionOptions])
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not load paid orders and payments')
    } finally {
      setSourcesLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRefunds()
  }, [loadRefunds])

  useEffect(() => {
    void loadSources()
  }, [loadSources])

  function chooseSource(key: string) {
    setSourceKey(key)
    const source = sources.find(item => item.key === key)
    setAmount(source ? String(source.amount) : '')
    setFormError('')
  }

  async function recordRefund(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return
    const source = sources.find(item => item.key === sourceKey)
    if (!source) {
      setFormError('Choose the order or payment you refunded')
      return
    }

    setSaving(true)
    setFormError('')
    setNotice('')
    try {
      await api.createRefund({
        order_id: source.orderId,
        transaction_id: source.transactionId,
        amount: Number(amount),
        reason: reason.trim() || undefined,
      })
      setNotice('Refund recorded. Mark it processed after you send the money.')
      setReason('')
      setSourceKey('')
      setAmount('')
      await Promise.all([loadRefunds(), loadSources()])
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not record the refund')
    } finally {
      setSaving(false)
    }
  }

  async function markProcessed() {
    if (!toProcess || processing) return
    setProcessing(true)
    setError('')
    try {
      const result = await api.processRefund(String(toProcess.id))
      const channels = result.notifications
        .filter(item => item.status === 'sent' || item.status === 'queued')
        .map(item => String(item.channel))
      setNotice(
        channels.length
          ? `Refund marked processed. Customer notified by ${channels.join(' and ')}.`
          : 'Refund marked processed. Add an email or phone to the customer to send a notification.',
      )
      setToProcess(null)
      await Promise.all([loadRefunds(), loadSources()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the refund')
      setToProcess(null)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Refunds</h1>
        <p className="text-sm text-gray-500">
          Track UPI refunds you send by hand. ToroPay records the status; it never moves money.
        </p>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Pending</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{formatMoney(pendingTotal)}</p>
          <p className="text-xs text-gray-500">Not sent to the customer yet</p>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Processed</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{formatMoney(processedTotal)}</p>
          <p className="text-xs text-gray-500">Marked as sent</p>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
        <div className="mb-4 flex items-center gap-2">
          <RotateCcw className="h-5 w-5 text-gray-500" />
          <div>
            <h2 className="font-semibold">Record a refund</h2>
            <p className="text-xs text-gray-500">Pick a paid order or payment, then enter the amount you sent.</p>
          </div>
        </div>

        <form onSubmit={recordRefund} className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_140px_minmax(0,1.5fr)_auto] lg:items-end">
          <label className="block text-xs font-semibold text-gray-600">
            Paid order or payment
            <select
              value={sourceKey}
              onChange={event => chooseSource(event.target.value)}
              disabled={sourcesLoading || saving}
              className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
            >
              <option value="">{sourcesLoading ? 'Loading...' : 'Choose...'}</option>
              {sources.map(source => (
                <option key={source.key} value={source.key}>{source.label}</option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-semibold text-gray-600">
            Amount
            <input
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={event => setAmount(event.target.value)}
              disabled={saving}
              className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              placeholder="0.00"
            />
          </label>

          <label className="block text-xs font-semibold text-gray-600">
            Reason (optional)
            <input
              value={reason}
              onChange={event => setReason(event.target.value)}
              maxLength={500}
              disabled={saving}
              className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              placeholder="Damaged item, customer cancelled..."
            />
          </label>

          <Button type="submit" disabled={saving || !sourceKey || !amount}>
            {saving ? 'Recording...' : 'Record refund'}
          </Button>
        </form>

        {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
        {notice && (
          <p className="mt-3 flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4" /> {notice}
          </p>
        )}
        <p className="mt-3 flex items-start gap-2 text-xs text-gray-500">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Open your UPI app and send the refund first. ToroPay cannot send UPI refunds automatically.
        </p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTERS.map(item => (
          <button
            key={item.value}
            onClick={() => setFilter(item.value)}
            aria-pressed={filter === item.value}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
              filter === item.value ? 'bg-charcoal text-white' : 'bg-white/60 text-gray-500 hover:bg-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-white/80 bg-white/60 p-12 text-center text-sm text-gray-500 backdrop-blur-sm">
          Loading...
        </div>
      ) : refunds.length === 0 ? (
        <EmptyState
          title={filter ? `No ${filter} refunds` : 'No refunds recorded yet'}
          description="When you refund a customer, record it here so they can see the status and your reports stay accurate."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/60 backdrop-blur-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Order / payment</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {refunds.map(refund => {
                const status = String(refund.status)
                return (
                  <tr key={String(refund.id)} className="border-t border-gray-100 align-top hover:bg-white/70">
                    <td className="px-4 py-3 text-gray-500">
                      {formatDateTime(String(refund.created_at))}
                      {refund.processed_at ? (
                        <p className="text-xs text-gray-400">Sent {formatDateTime(String(refund.processed_at))}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{String(refund.customer_name ?? 'Customer')}</p>
                      {refund.customer_phone ? <p className="text-xs text-gray-500">{String(refund.customer_phone)}</p> : null}
                      {refund.customer_email ? <p className="text-xs text-gray-500">{String(refund.customer_email)}</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{String(refund.order_number ?? refund.transaction_ref ?? refund.refund_number)}</p>
                      <p className="text-xs text-gray-500">
                        {refund.order_id ? 'Order' : 'Payment'} - {String(refund.refund_number)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{formatMoney(Number(refund.amount))}</td>
                    <td className="max-w-[220px] px-4 py-3 text-gray-600">{String(refund.reason ?? '-')}</td>
                    <td className="px-4 py-3">
                      <Badge tone={status === 'processed' ? 'green' : status === 'failed' ? 'red' : 'yellow'}>
                        {status === 'processed' ? 'Processed' : status === 'failed' ? 'Failed' : 'Pending'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {status === 'pending' ? (
                        <Button size="sm" variant="secondary" onClick={() => setToProcess(refund)}>
                          Mark processed
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!toProcess}
        onClose={() => setToProcess(null)}
        onConfirm={markProcessed}
        busy={processing}
        title="Mark refund processed?"
        message={
          toProcess
            ? `Only do this after you have sent ${formatMoney(Number(toProcess.amount))} to the customer. They will be notified by email or WhatsApp if their contact is saved.`
            : ''
        }
        confirmLabel="Yes, money sent"
      />
    </div>
  )
}
