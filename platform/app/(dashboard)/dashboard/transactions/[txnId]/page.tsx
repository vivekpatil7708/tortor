'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { formatAmount, formatDate, statusColor } from '@/lib/utils'
import { X, Send, Eye, EyeOff, Check, Copy, ExternalLink, MessageSquare } from 'lucide-react'
import { DEFAULT_TEMPLATES, SUPPORTED_VARIABLES, renderTemplate } from '@/lib/messaging'

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

function SendConfirmationModal({ txn, onClose, onSent }: { txn: Record<string, any>; onClose: () => void; onSent: () => void }) {
  const [channel, setChannel] = useState('whatsapp')
  const [recipient, setRecipient] = useState(txn.customer_phone || txn.customer_email || '')
  const [subject, setSubject] = useState(DEFAULT_TEMPLATES.email.subject)
  const [body, setBody] = useState(DEFAULT_TEMPLATES.whatsapp.body)
  const [showPreview, setShowPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [copied, setCopied] = useState(false)

  const fillData: Record<string, string> = {
    customer_name: txn.customer_name || 'Customer',
    order_id: txn.txn_id || '',
    merchant_name: txn.merchant?.business_name || '',
    product_name: 'Order',
    order_amount: String(txn.amount || ''),
    currency: 'INR',
    payment_status: txn.status || 'Confirmed',
    payment_link: txn.payment_link?.slug ? `https://toropay.co.in/pay/${txn.payment_link.slug}` : '',
    delivery_eta: '3-5 business days',
    support_email: txn.merchant?.email || '',
    support_phone: txn.merchant?.phone || '',
    custom_note: txn.customer_note || '',
  }

  useEffect(() => {
    const defaults = DEFAULT_TEMPLATES[channel]
    if (defaults) {
      setSubject(defaults.subject)
      setBody(defaults.body)
    }
  }, [channel])

  const handleChannelChange = (ch: string) => {
    setChannel(ch)
    const defaults = DEFAULT_TEMPLATES[ch]
    if (defaults) {
      setSubject(defaults.subject)
      setBody(defaults.body)
    }
    if (ch === 'email') setRecipient(txn.customer_email || '')
    else setRecipient(txn.customer_phone || '')
  }

  const renderedSubject = renderTemplate(subject, fillData)
  const renderedBody = renderTemplate(body, fillData)

  const handleSend = async () => {
    if (!recipient) return
    setSending(true)
    try {
      await api.sendMessage({
        channel,
        recipient,
        subject,
        template: body,
        orderId: txn.txn_id,
        data: fillData,
      })
      setSent(true)
      setTimeout(() => { onSent() }, 1500)
    } catch {
      alert('Failed to send message.')
    } finally {
      setSending(false)
    }
  }

  const handleCopyMessage = () => {
    const text = channel === 'email' ? `Subject: ${renderedSubject}\n\n${renderedBody}` : renderedBody
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (sent) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
          <Check className="h-7 w-7 text-green-600" />
        </div>
        <h2 className="text-lg font-bold">Message Sent!</h2>
        <p className="mt-1 text-sm text-gray-500">Confirmation sent via {channel}.</p>
      </div>
    </div>
  )

  const isInstagram = channel === 'instagram'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-charcoal" />
            <h2 className="text-lg font-bold">Send Confirmation</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <p className="mb-2 text-xs font-semibold text-gray-500">Channel</p>
            <div className="flex gap-2">
              {['whatsapp', 'email', 'instagram'].map(ch => (
                <button key={ch} onClick={() => handleChannelChange(ch)}
                  className={`rounded-xl px-4 py-2 text-xs font-semibold capitalize ${channel === ch ? 'bg-charcoal text-white' : 'border border-gray-200 text-gray-500 hover:text-charcoal'}`}>
                  {ch === 'instagram' ? 'Instagram' : ch === 'whatsapp' ? 'WhatsApp' : 'Email'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold text-gray-500">Recipient</p>
            <input value={recipient} onChange={e => setRecipient(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-charcoal" placeholder={channel === 'email' ? 'customer@email.com' : '+91-phone-number'} />
          </div>

          {channel === 'email' && (
            <div>
              <p className="mb-1 text-xs font-semibold text-gray-500">Subject</p>
              <input value={subject} onChange={e => setSubject(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-charcoal" />
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-semibold text-gray-500">Message</p>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={6}
              className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-charcoal" />
          </div>

          {isInstagram && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              Instagram does not support sending messages directly. Instead, you can preview, copy, or open Instagram to send manually.
            </div>
          )}

          <div className="flex items-center justify-between">
            <button onClick={() => setShowPreview(!showPreview)} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-charcoal">
              {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showPreview ? 'Hide Preview' : 'Preview'}
            </button>
            <div className="flex gap-2">
              {isInstagram && (
                <>
                  <button onClick={handleCopyMessage} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-500 hover:text-charcoal">
                    <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-500 hover:text-charcoal">
                    <ExternalLink className="h-3.5 w-3.5" /> Open Instagram
                  </a>
                </>
              )}
              {!isInstagram && (
                <button onClick={handleSend} disabled={sending || !recipient}
                  className="flex items-center gap-1.5 rounded-xl bg-charcoal px-5 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
                  <Send className="h-3.5 w-3.5" /> {sending ? 'Sending...' : 'Send'}
                </button>
              )}
            </div>
          </div>

          {showPreview && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="mb-2 text-xs font-semibold text-gray-400">PREVIEW</p>
              {renderedSubject && <p className="mb-1 text-xs font-medium text-gray-600">Subject: {renderedSubject}</p>}
              <p className="whitespace-pre-wrap text-sm text-gray-700">{renderedBody}</p>
            </div>
          )}

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <p className="mb-2 text-xs font-semibold text-gray-400">Available Variables</p>
            <div className="flex flex-wrap gap-1">
              {SUPPORTED_VARIABLES.map(v => (
                <code key={v} className="rounded-md bg-white px-1.5 py-0.5 text-xs text-gray-500">{`{{${v}}}`}</code>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
