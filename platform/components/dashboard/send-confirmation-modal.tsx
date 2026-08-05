'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { DEFAULT_TEMPLATES, SUPPORTED_VARIABLES, renderTemplate } from '@/lib/messaging'
import { X, Send, Eye, EyeOff, Check, Copy, ExternalLink, MessageSquare } from 'lucide-react'

interface Props {
  txn: Record<string, any>
  onClose: () => void
  onSent: () => void
}

export default function SendConfirmationModal({ txn, onClose, onSent }: Props) {
  const [channel, setChannel] = useState('whatsapp')
  const [recipient, setRecipient] = useState(txn.customer_phone || txn.customer_email || '')
  const [subject, setSubject] = useState(DEFAULT_TEMPLATES.email.subject)
  const [body, setBody] = useState(DEFAULT_TEMPLATES.whatsapp.body)
  const [showPreview, setShowPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [copied, setCopied] = useState(false)
  const [channelStatus, setChannelStatus] = useState<Record<string, any> | null>(null)

  useEffect(() => {
    api.getChannelStatus().then(r => setChannelStatus(r.channels as unknown as Record<string, any>)).catch(() => {})
  }, [])

  const fillData: Record<string, string> = {
    customer_name: txn.customer_name || 'Customer',
    order_id: txn.txn_id || '',
    merchant_name: txn.merchant?.business_name || '',
    product_name: 'Order',
    order_amount: String(txn.amount || ''),
    currency: 'INR',
    payment_status: txn.status || 'Confirmed',
    payment_link: txn.payment_link?.slug ? `https://www.toropay.co.in/pay/${txn.payment_link.slug}` : '',
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

  const channelInfo = channelStatus?.[channel]
  const isComingSoon = channelInfo?.status === 'coming_soon'
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
            <div className="flex flex-wrap gap-2">
              {['whatsapp', 'email', 'instagram'].map(ch => {
                const st = channelStatus?.[ch]?.status
                return (
                  <button key={ch} onClick={() => handleChannelChange(ch)}
                    className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold capitalize ${channel === ch ? 'bg-charcoal text-white' : 'border border-gray-200 text-gray-500 hover:text-charcoal'}`}>
                    {ch === 'instagram' ? 'Instagram' : ch === 'whatsapp' ? 'WhatsApp' : 'Email'}
                    {st === 'coming_soon' && <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Soon</span>}
                  </button>
                )
              })}
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

          {isComingSoon && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              {channel === 'whatsapp' ? 'WhatsApp message sending is coming soon. You can still preview and copy the message to send manually.' : 'Instagram message sending is coming soon. You can still preview, copy, or open Instagram to send manually.'}
            </div>
          )}

          <div className="flex items-center justify-between">
            <button onClick={() => setShowPreview(!showPreview)} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-charcoal">
              {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showPreview ? 'Hide Preview' : 'Preview'}
            </button>
            <div className="flex gap-2">
              {isComingSoon || isInstagram ? (
                <>
                  <button onClick={handleCopyMessage} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-500 hover:text-charcoal">
                    <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied!' : 'Copy'}
                  </button>
                  {isInstagram && (
                    <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-500 hover:text-charcoal">
                      <ExternalLink className="h-3.5 w-3.5" /> Open Instagram
                    </a>
                  )}
                </>
              ) : (
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
