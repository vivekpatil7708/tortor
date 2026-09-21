'use client'

import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_BROADCAST_TEMPLATE, SAMPLE_DATA, renderTemplate, SUPPORTED_VARIABLES } from '@/lib/messaging'

interface Merchant {
  id: string
  email: string
  business_name: string
  status: string
}

export default function AdminMessaging() {
  const [subject, setSubject] = useState(DEFAULT_BROADCAST_TEMPLATE.subject)
  const [body, setBody] = useState(DEFAULT_BROADCAST_TEMPLATE.body)
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState<'all' | 'selected'>('all')
  const [showPreview, setShowPreview] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ total: number; sent: number; failed: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<Array<{ merchant_name: string; email: string; status: string; subject: string; created_at: string }>>([])

  useEffect(() => {
    fetch('/api/admin/merchants').then(r => r.json()).then(d => {
      const active = (d.merchants || []).filter((m: Merchant) => m.status === 'active')
      setMerchants(active)
      setSelected(new Set(active.map((m: Merchant) => m.id)))
    }).catch(() => {})
    fetch('/api/admin/broadcast?limit=20').then(r => r.json()).then(d => {
      if (d.logs) setLogs(d.logs)
    }).catch(() => {})
  }, [])

  const filtered = useMemo(
    () => merchants.filter(m =>
      m.email.toLowerCase().includes(search.toLowerCase()) ||
      m.business_name.toLowerCase().includes(search.toLowerCase())
    ),
    [merchants, search]
  )

  const recipientCount = mode === 'all' ? merchants.length : selected.size

  const sampleData: Record<string, string> = { ...(SAMPLE_DATA as unknown as Record<string, string>) }
  const renderedSubject = renderTemplate(subject || DEFAULT_BROADCAST_TEMPLATE.subject, sampleData)
  const renderedBody = renderTemplate(body || DEFAULT_BROADCAST_TEMPLATE.body, sampleData)

  function toggleMerchant(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllVisible() {
    setSelected(prev => {
      const next = new Set(prev)
      const allVisibleSelected = filtered.every(m => next.has(m.id))
      filtered.forEach(m => { if (allVisibleSelected) next.delete(m.id); else next.add(m.id) })
      return next
    })
  }

  function resetTemplate() {
    setSubject(DEFAULT_BROADCAST_TEMPLATE.subject)
    setBody(DEFAULT_BROADCAST_TEMPLATE.body)
    setResult(null)
    setError(null)
  }

  async function handleSend() {
    if (!subject.trim() || !body.trim()) {
      setError('Subject and body are required.')
      return
    }
    if (mode === 'selected' && selected.size === 0) {
      setError('Select at least one merchant.')
      return
    }
    setSending(true)
    setError(null)
    try {
      const payload: { subject: string; body: string; merchantIds?: string[] } = { subject, body }
      if (mode === 'selected') payload.merchantIds = Array.from(selected)
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')
      setResult(data)
      setShowConfirm(false)
      const logRes = await fetch('/api/admin/broadcast?limit=20')
      const logData = await logRes.json()
      if (logData.logs) setLogs(logData.logs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Email Merchants</h1>
        <p className="text-sm text-gray-500">
          Send an email to {recipientCount > 0 ? <strong>{recipientCount}</strong> : 'all'} {mode === 'all' ? 'active' : 'selected'} merchant{recipientCount === 1 ? '' : 's'}.
        </p>
      </div>

      {result && (
        <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-5">
          <p className="font-semibold text-green-800">Campaign sent</p>
          <p className="mt-1 text-sm text-green-700">
            {result.sent} of {result.total} merchants emailed{result.failed > 0 ? `, ${result.failed} failed` : ''}.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      <div className="mb-6 flex gap-2">
        <button onClick={() => setMode('all')}
          className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${mode === 'all' ? 'bg-charcoal text-white' : 'border border-gray-200 bg-white text-gray-500 hover:text-charcoal'}`}>
          All active merchants
        </button>
        <button onClick={() => setMode('selected')}
          className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${mode === 'selected' ? 'bg-charcoal text-white' : 'border border-gray-200 bg-white text-gray-500 hover:text-charcoal'}`}>
          Choose individual merchants{mode === 'selected' ? ` (${selected.size})` : ''}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          {mode === 'selected' && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search merchants..."
                  className="w-56 rounded-xl border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-gray-400" />
                <button onClick={toggleAllVisible}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                  Select / clear shown
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-100">
                {filtered.map(m => (
                  <label key={m.id} className="flex cursor-pointer items-center gap-3 border-b border-gray-50 px-3 py-2.5 hover:bg-gray-50">
                    <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleMerchant(m.id)}
                      className="h-4 w-4 accent-[#7bb86c]" />
                    <span className="flex-1">
                      <span className="block text-sm font-medium">{m.business_name}</span>
                      <span className="block text-xs text-gray-400">{m.email}</span>
                    </span>
                  </label>
                ))}
                {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-gray-400">No merchants match your search</p>}
              </div>
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-semibold text-gray-500">Subject Line</p>
            <input value={subject} onChange={e => setSubject(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-charcoal" />
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold text-gray-500">Message Body</p>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={14}
              className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-mono outline-none focus:border-charcoal" />
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <p className="mb-2 text-xs font-semibold text-gray-400">Available Variables</p>
            <div className="flex flex-wrap gap-1">
              {SUPPORTED_VARIABLES.map(v => (
                <code key={v} className="rounded-md bg-white px-1.5 py-0.5 text-xs text-gray-500">{`{{${v}}}`}</code>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowConfirm(true)} disabled={sending || recipientCount === 0}
              className="flex items-center gap-1.5 rounded-xl bg-[#7bb86c] px-5 py-2.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {sending ? 'Sending...' : `Send to ${recipientCount} merchant${recipientCount === 1 ? '' : 's'}`}
            </button>
            <button onClick={resetTemplate}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-xs font-semibold text-gray-500 hover:text-charcoal">
              Reset to Draft
            </button>
            <button onClick={() => setShowPreview(!showPreview)}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-xs font-semibold text-gray-500 hover:text-charcoal">
              {showPreview ? 'Hide Preview' : 'Preview'}
            </button>
          </div>

          {showConfirm && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <p className="font-semibold text-amber-800">Send to {recipientCount} merchant{recipientCount === 1 ? '' : 's'}?</p>
              <p className="mt-1 text-sm text-amber-700">This sends the email immediately. This cannot be undone.</p>
              <div className="mt-3 flex gap-2">
                <button onClick={handleSend} disabled={sending}
                  className="rounded-xl bg-charcoal px-5 py-2.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
                  {sending ? 'Sending...' : 'Yes, send it'}
                </button>
                <button onClick={() => setShowConfirm(false)} disabled={sending}
                  className="rounded-xl border border-gray-300 px-4 py-2.5 text-xs font-semibold text-gray-600 hover:bg-white">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {showPreview && (
            <div className="rounded-2xl border border-gray-100 bg-white/60 p-5 backdrop-blur-sm">
              <p className="mb-3 text-xs font-semibold text-gray-400">LIVE PREVIEW</p>
              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="mb-2 text-xs font-medium text-gray-600">Subject: {renderedSubject}</p>
                <p className="whitespace-pre-wrap text-sm text-gray-700">{renderedBody}</p>
              </div>
            </div>
          )}

          <div>
            <p className="mb-3 text-xs font-semibold text-gray-500">Recent Broadcast Logs</p>
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-100 bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold text-gray-500">Merchant</th>
                    <th className="px-4 py-2.5 font-semibold text-gray-500">Status</th>
                    <th className="px-4 py-2.5 font-semibold text-gray-500">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.created_at + l.email} className="border-b border-gray-50">
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{l.merchant_name}</p>
                        <p className="text-xs text-gray-400">{l.email}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${l.status === 'sent' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                          {l.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-400">{new Date(l.created_at).toLocaleDateString('en-IN')}</td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">No broadcast logs yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}