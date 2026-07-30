'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { formatAmount, formatDate, statusColor } from '@/lib/utils'
import { Send, ExternalLink } from 'lucide-react'
import SendConfirmationModal from '@/components/dashboard/send-confirmation-modal'

export default function TransactionDetailPage() {
  const { txnId } = useParams<{ txnId: string }>()
  const router = useRouter()
  const [txn, setTxn] = useState<Record<string, any> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showSendModal, setShowSendModal] = useState(false)
  const [logs, setLogs] = useState<Record<string, any>[]>([])

  const fetchTxn = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.getTransaction(txnId)
      setTxn(data as Record<string, any>)
      const logsData = await api.getMessageLogs(txnId)
      setLogs(logsData.logs as Record<string, any>[])
    } catch {
      setError('Transaction not found')
    } finally {
      setLoading(false)
    }
  }, [txnId])

  useEffect(() => { fetchTxn() }, [fetchTxn])

  if (loading) return (
    <div className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded-xl bg-gray-100" />
      <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
    </div>
  )

  if (error || !txn) return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-sm text-red-500">{error || 'Not found'}</p>
      <button onClick={() => router.push('/dashboard/transactions')} className="mt-4 rounded-xl bg-charcoal px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">Back to Transactions</button>
    </div>
  )

  const customerFields = txn.custom_field_values || {}
  const products = customerFields._selected_products || []
  const paymentLink = txn.payment_link || null

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <button onClick={() => router.push('/dashboard/transactions')} className="mb-2 text-xs font-medium text-gray-400 hover:text-gray-600">&larr; Transactions</button>
          <h1 className="text-2xl font-bold tracking-tight">{txn.txn_id}</h1>
          <p className="text-sm text-gray-500">{formatDate(txn.created_at)}</p>
        </div>
        <div className="flex gap-2">
          <span className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${statusColor(txn.status)}`}>{txn.status}</span>
          {(txn.status === 'success' || txn.status === 'pending') && (
            <button onClick={() => setShowSendModal(true)} className="flex items-center gap-1.5 rounded-xl bg-charcoal px-4 py-2 text-xs font-semibold text-white hover:opacity-90">
              <Send className="h-3.5 w-3.5" /> Send Confirmation
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
            <h2 className="mb-4 text-sm font-bold text-gray-700">Order Details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-gray-400">Customer Name</p>
                <p className="text-sm font-medium">{txn.customer_name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Customer Phone</p>
                <p className="text-sm font-medium">{txn.customer_phone || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Customer Email</p>
                <p className="text-sm font-medium">{txn.customer_email || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Amount</p>
                <p className="text-sm font-bold">{formatAmount(txn.amount)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Payment App</p>
                <p className="text-sm font-medium">{txn.payment_app || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Payer VPA</p>
                <p className="text-sm font-medium">{txn.payer_vpa || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">UTR / UPI Ref</p>
                <p className="text-sm font-medium">{txn.upi_txn_id || txn.upi_payment_ref || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Merchant</p>
                <p className="text-sm font-medium">{txn.merchant?.business_name || txn.merchant?.email || '—'}</p>
              </div>
            </div>
          </div>

          {paymentLink ? (
            <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
              <h2 className="mb-4 text-sm font-bold text-gray-700">Payment Link</h2>
              <p className="text-sm font-medium">{paymentLink.title}</p>
              {paymentLink.amount && <p className="text-xs text-gray-400">Amount: {formatAmount(paymentLink.amount)}</p>}
              {paymentLink.slug && (
                <a href={`/pay/${paymentLink.slug}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary-500 hover:underline">
                  Open Checkout <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          ) : null}

          {products.length > 0 ? (
            <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
              <h2 className="mb-4 text-sm font-bold text-gray-700">Products</h2>
              <div className="space-y-2">
                {products.map((p: any, i: number) => (
                  <div key={i} className="flex justify-between rounded-lg bg-white/50 px-4 py-2 text-sm">
                    <span>{p.name || p.product_name || `Product ${i + 1}`}</span>
                    <span className="font-medium">{p.price ? formatAmount(Number(p.price)) : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {txn.customer_note ? (
            <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
              <h2 className="mb-2 text-sm font-bold text-gray-700">Customer Note</h2>
              <p className="text-sm text-gray-500">{txn.customer_note}</p>
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
            <h2 className="mb-4 text-sm font-bold text-gray-700">Message History</h2>
            {logs.length === 0 ? (
              <p className="text-sm text-gray-400">No messages sent yet.</p>
            ) : (
              <div className="space-y-3">
                {logs.map((log: any) => (
                  <div key={log.id} className="rounded-xl border border-gray-100 bg-white/50 p-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`rounded-md px-1.5 py-0.5 font-semibold ${log.status === 'sent' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>{log.status}</span>
                      <span className="text-gray-400">{log.channel}</span>
                      <span className="text-gray-400">to {log.recipient}</span>
                    </div>
                    {log.subject && <p className="mt-1 text-xs font-medium text-gray-600">{log.subject}</p>}
                    <p className="mt-0.5 text-xs text-gray-400">{new Date(log.created_at).toLocaleString('en-IN')}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showSendModal && <SendConfirmationModal txn={txn} onClose={() => setShowSendModal(false)} onSent={() => { setShowSendModal(false); fetchTxn() }} />}
    </div>
  )
}


