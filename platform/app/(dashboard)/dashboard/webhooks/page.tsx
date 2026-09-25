'use client'

import { useEffect, useState } from 'react'
import { Copy, Check, Plus, RotateCcw, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

const EVENT_OPTIONS = [
  'order.created', 'order.updated', 'order.paid', 'payment.paid', 'payment.failed',
  'fulfillment.created', 'fulfillment.shipped', 'fulfillment.delivered',
]

interface Endpoint {
  id: string
  url: string
  mode: 'test' | 'live'
  active: boolean
  event_types: unknown
  failed_count: number
  last_delivery_at: string | null
  created_at: string
  secret?: string
}

interface DeliveryLog {
  id: string
  endpoint_url: string
  mode: string
  event_id: string
  event_type: string
  status: string
  response_code: number | null
  error_message: string | null
  retry_count: number
  created_at: string
}

export default function WebhooksPage() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([])
  const [logs, setLogs] = useState<DeliveryLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    url: '',
    mode: 'test' as 'test' | 'live',
    secret: '',
    event_types: [] as string[],
  })

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refresh() {
    const [eps, logsRes] = await Promise.all([
      fetch('/api/webhooks').then(r => (r.ok ? r.json() : [])),
      fetch('/api/webhooks/logs').then(r => (r.ok ? r.json() : [])),
    ])
    setEndpoints(eps)
    setLogs(logsRes)
    setLoading(false)
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(text.slice(0, 40))
    setTimeout(() => setCopied(''), 1500)
  }

  function toggleEvent(event: string) {
    setForm(f => ({
      ...f,
      event_types: f.event_types.includes(event)
        ? f.event_types.filter(e => e !== event)
        : [...f.event_types, event],
    }))
  }

  async function createEndpoint(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await fetch('/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: form.url,
        mode: form.mode,
        secret: form.secret || undefined,
        event_types: form.event_types.length ? form.event_types : ['*'],
      }),
    })
    const data = (await res.json()) as { error?: string; endpoint?: Endpoint; secret?: string }
    setSaving(false)
    if (!res.ok || !data.endpoint) {
      setError(data.error || 'Failed to create endpoint')
      return
    }
    setEndpoints(prev => [{ ...data.endpoint!, secret: data.secret }, ...prev])
    setShowForm(false)
    setForm({ url: '', mode: 'test', secret: '', event_types: [] })
  }

  async function toggleActive(ep: Endpoint) {
    await fetch(`/api/webhooks/${ep.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !ep.active }),
    })
    setEndpoints(prev => prev.map(x => (x.id === ep.id ? { ...x, active: !x.active } : x)))
  }

  async function sendTest(ep: Endpoint) {
    await fetch(`/api/webhooks/${ep.id}/test`, { method: 'POST' })
    refresh()
  }

  async function removeEndpoint(ep: Endpoint) {
    if (!window.confirm(`Delete endpoint ${ep.url}?`)) return
    await fetch(`/api/webhooks/${ep.id}`, { method: 'DELETE' })
    setEndpoints(prev => prev.filter(x => x.id !== ep.id))
  }

  async function retryLog(logId: string) {
    await fetch(`/api/webhooks/logs/${logId}/retry`, { method: 'POST' })
    refresh()
  }

  const events = (value: unknown) => Array.isArray(value) ? value as string[] : []

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Webhooks</h1>
          <p className="text-sm text-gray-500">Send your merchant a real-time POST when payments or orders change.</p>
        </div>
        <Button type="button" size="sm" onClick={() => setShowForm(s => !s)}>
          <Plus className="mr-1.5 h-4 w-4" /> Add endpoint
        </Button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {showForm && (
        <form onSubmit={createEndpoint} className="space-y-4 rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
          <h2 className="font-bold">New webhook endpoint</h2>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Endpoint URL *</span>
            <input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://your-app.com/webhooks/toropay" required
              className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">Mode</span>
              <select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value as 'test' | 'live' })}
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none">
                <option value="test">Test</option>
                <option value="live">Live</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">Signing secret</span>
              <input value={form.secret} onChange={e => setForm({ ...form, secret: e.target.value })} placeholder="Generated if left blank"
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none" />
            </label>
          </div>
          <div>
            <span className="mb-2 block text-xs font-semibold text-gray-500">Subscribe to events (empty = all)</span>
            <div className="flex flex-wrap gap-2">
              {EVENT_OPTIONS.map(ev => (
                <button key={ev} type="button" onClick={() => toggleEvent(ev)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${form.event_types.includes(ev) ? 'bg-charcoal text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {ev}
                </button>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create endpoint'}</Button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <>
          <div className="space-y-3">
            {endpoints.length === 0 && (
              <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400">
                No endpoints yet. Add one to receive signed events.
              </div>
            )}
            {endpoints.map(ep => (
              <div key={ep.id} className="rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="truncate text-xs font-semibold text-gray-600">{ep.url}</code>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${ep.mode === 'test' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{ep.mode}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${ep.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {ep.active ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {events(ep.event_types).length ? events(ep.event_types).join(', ') : 'All events'}
                      {ep.failed_count > 0 ? ` · ${ep.failed_count} recent failures` : ''}
                    </p>
                    <div className="mt-1 text-xs text-gray-400">
                      {ep.last_delivery_at ? `Last delivery ${new Date(ep.last_delivery_at).toLocaleString('en-IN')}` : 'No deliveries yet'}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => sendTest(ep)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-charcoal" aria-label="Send test event">
                      <Send className="h-4 w-4" />
                    </button>
                    <button onClick={() => toggleActive(ep)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-charcoal" aria-label="Pause or resume">
                      {ep.active ? 'Pause' : 'Resume'}
                    </button>
                    <button onClick={() => removeEndpoint(ep)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500" aria-label="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {ep.secret && (
                  <div className="mt-2 flex items-center gap-2">
                    <code className="truncate rounded-lg bg-gray-100 px-2 py-1 font-mono text-xs text-gray-500">{ep.secret}</code>
                    <button onClick={() => copy(ep.secret!)} className="text-gray-400 hover:text-charcoal" aria-label="Copy secret">
                      {copied === ep.secret.slice(0, 40) ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-400">Delivery logs</h2>
            {logs.length === 0 ? (
              <p className="text-sm text-gray-400">No deliveries yet.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/60 backdrop-blur-sm">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wider text-gray-400">
                      <th className="px-4 py-3">Event</th>
                      <th className="px-4 py-3">Endpoint</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => (
                      <tr key={log.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-xs">{log.event_type}</span>
                          <p className="text-[10px] text-gray-400">{new Date(log.created_at).toLocaleString('en-IN')}</p>
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-2.5 font-mono text-xs text-gray-500">{log.endpoint_url}</td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${log.status === 'delivered' ? 'bg-green-100 text-green-700' : log.status === 'retrying' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                            {log.status}
                          </span>
                          {log.retry_count > 0 && <span className="ml-1 text-[10px] text-gray-400">×{log.retry_count}</span>}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{log.response_code ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          {log.status !== 'delivered' && (
                            <button onClick={() => retryLog(log.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-charcoal" aria-label="Retry">
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}