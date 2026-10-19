'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, RefreshCw, Send, Copy, Check, ChevronDown, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { LoadError } from '@/components/ui/load-error'

/** Every event ToroPay can deliver. Kept in step with OUTGOING_WEBHOOK_EVENTS on the server. */
const EVENT_OPTIONS = [
  { value: 'order.created', label: 'Order created' },
  { value: 'order.paid', label: 'Order paid' },
  { value: 'order.updated', label: 'Order updated' },
  { value: 'payment.paid', label: 'Payment paid' },
  { value: 'payment.failed', label: 'Payment failed' },
  { value: 'fulfillment.created', label: 'Fulfillment created' },
  { value: 'fulfillment.shipped', label: 'Fulfillment shipped' },
  { value: 'fulfillment.delivered', label: 'Fulfillment delivered' },
] as const

const EVENT_LABELS: Record<string, string> = Object.fromEntries(EVENT_OPTIONS.map(o => [o.value, o.label]))

interface Endpoint {
  id: string
  url: string
  mode: 'test' | 'live'
  active: boolean
  event_types: string[]
  failed_count: number
  last_delivery_at: string | null
  created_at: string
}

interface Delivery {
  id: string
  event_id: string
  event_type: string
  status: string
  response_code: number | null
  response_body: string | null
  error_message: string | null
  retry_count: number
  next_retry_at: string | null
  delivered_at: string | null
  created_at: string
}

const STATUS_STYLES: Record<string, string> = {
  delivered: 'bg-green-100 text-green-700',
  pending: 'bg-gray-100 text-gray-600',
  retrying: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-600',
  disabled: 'bg-gray-100 text-gray-500',
}

function DeliveryRow({ endpointId, delivery, onRetried }: { endpointId: string; delivery: Delivery; onRetried: () => void }) {
  const [open, setOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const canRetry = delivery.status === 'failed' || delivery.status === 'retrying'

  async function retry() {
    setRetrying(true)
    try {
      await api.retryWebhookDelivery(endpointId, delivery.id)
      onRetried()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="border-t border-gray-100 py-2 first:border-t-0">
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLES[delivery.status] || 'bg-gray-100 text-gray-600'}`}>
            {delivery.status}
          </span>
          <span className="truncate font-mono text-gray-700">{delivery.event_type}</span>
          {delivery.response_code != null && <span className="text-gray-400">· {delivery.response_code}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-gray-400">{new Date(delivery.created_at).toLocaleString('en-IN')}</span>
          {canRetry && (
            <button onClick={retry} disabled={retrying} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Retry delivery">
              <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
            </button>
          )}
          <button onClick={() => setOpen(o => !o)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Show details">
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>
      {delivery.retry_count > 0 && (
        <p className="mt-1 text-[11px] text-gray-400">
          {delivery.retry_count} retr{delivery.retry_count === 1 ? 'y' : 'ies'}
          {delivery.next_retry_at ? ` · next ${new Date(delivery.next_retry_at).toLocaleString('en-IN')}` : ''}
        </p>
      )}
      {open && (
        <div className="mt-2 space-y-1 rounded-lg bg-gray-50 p-2 text-[11px] text-gray-600">
          <p><span className="font-semibold">Event ID:</span> <span className="font-mono">{delivery.event_id}</span></p>
          {delivery.error_message && <p className="text-red-600"><span className="font-semibold">Error:</span> {delivery.error_message}</p>}
          {delivery.response_body && (
            <p className="break-all"><span className="font-semibold">Response:</span> <span className="font-mono">{delivery.response_body}</span></p>
          )}
        </div>
      )}
    </div>
  )
}

function EndpointCard({ endpoint, onChange }: { endpoint: Endpoint; onChange: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null)
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadDeliveries() {
    setLoadingLogs(true)
    try {
      setDeliveries((await api.getWebhookDeliveries(endpoint.id, 50)) as unknown as Delivery[])
    } catch {
      setDeliveries([])
    } finally {
      setLoadingLogs(false)
    }
  }

  function toggleExpand() {
    const next = !expanded
    setExpanded(next)
    if (next && deliveries === null) loadDeliveries()
  }

  async function toggleActive() {
    setBusy(true)
    try {
      await api.updateWebhookEndpoint(endpoint.id, { active: !endpoint.active })
      onChange()
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Delete the endpoint ${endpoint.url}? Its delivery history is removed too.`)) return
    setBusy(true)
    try {
      await api.deleteWebhookEndpoint(endpoint.id)
      onChange()
    } finally {
      setBusy(false)
    }
  }

  async function sendTest() {
    setTesting(true)
    setMessage('')
    try {
      const res = await api.sendTestWebhook(endpoint.id)
      setMessage(res.message)
      if (expanded) loadDeliveries()
      onChange()
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Could not send the test event')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-bold">{endpoint.url}</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${endpoint.mode === 'test' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
              {endpoint.mode}
            </span>
            {!endpoint.active && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500">Off</span>}
            {endpoint.failed_count > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-600">
                <AlertTriangle className="h-3 w-3" /> Failing
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {endpoint.event_types.includes('*')
              ? 'All events'
              : endpoint.event_types.map(e => EVENT_LABELS[e] || e).join(', ')}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">
            {endpoint.last_delivery_at
              ? `Last delivery ${new Date(endpoint.last_delivery_at).toLocaleString('en-IN')}`
              : 'No deliveries yet'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={sendTest} disabled={testing} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-charcoal" aria-label="Send test event">
            <Send className={`h-4 w-4 ${testing ? 'animate-pulse' : ''}`} />
          </button>
          <button onClick={toggleActive} disabled={busy} className="rounded-lg p-2 text-xs font-semibold text-gray-500 hover:bg-gray-100 hover:text-charcoal">
            {endpoint.active ? 'Turn off' : 'Turn on'}
          </button>
          <button onClick={remove} disabled={busy} className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-500" aria-label="Delete endpoint">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {message && <p role="status" className="mt-2 text-xs text-gray-600">{message}</p>}

      <button onClick={toggleExpand} className="mt-3 flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-charcoal">
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        {expanded ? 'Hide delivery log' : 'Delivery log'}
      </button>

      {expanded && (
        <div className="mt-2 rounded-xl border border-gray-100 bg-white/60 p-2">
          {loadingLogs ? (
            <p className="px-2 py-3 text-xs text-gray-500">Loading…</p>
          ) : !deliveries || deliveries.length === 0 ? (
            <p className="px-2 py-3 text-xs text-gray-500">No deliveries recorded for this endpoint yet.</p>
          ) : (
            deliveries.map(d => (
              <DeliveryRow key={d.id} endpointId={endpoint.id} delivery={d} onRetried={loadDeliveries} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function WebhooksPage() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [revealed, setRevealed] = useState<{ url: string; secret: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const [form, setForm] = useState({
    url: '',
    mode: 'live' as 'test' | 'live',
    eventTypes: EVENT_OPTIONS.map(o => o.value) as string[],
  })

  function load() {
    setLoading(true)
    setFailed(false)
    api.getWebhookEndpoints()
      .then(rows => { setEndpoints(rows as unknown as Endpoint[]); setLoading(false) })
      .catch(() => { setFailed(true); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  function toggleEvent(value: string) {
    setForm(f => ({
      ...f,
      eventTypes: f.eventTypes.includes(value)
        ? f.eventTypes.filter(e => e !== value)
        : [...f.eventTypes, value],
    }))
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const res = await api.createWebhookEndpoint(form)
      setRevealed({ url: form.url, secret: res.secret })
      setShowForm(false)
      setForm({ url: '', mode: 'live', eventTypes: EVENT_OPTIONS.map(o => o.value) })
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create the endpoint')
    } finally {
      setSaving(false)
    }
  }

  function copySecret() {
    if (!revealed) return
    navigator.clipboard.writeText(revealed.secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const allSelected = form.eventTypes.length === EVENT_OPTIONS.length

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Webhooks</h1>
          <p className="text-sm text-gray-500">
            Send order and payment events to your own server as they happen. Each request is signed with
            the X-ToroPay-Signature header so you can verify it came from ToroPay.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setShowForm(s => !s)}>
          <Plus className="mr-1.5 h-4 w-4" /> Add endpoint
        </Button>
      </div>

      {revealed && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-green-800">Endpoint created — copy the signing secret now</p>
            <button onClick={() => setRevealed(null)} className="text-xs text-green-700 hover:underline">Dismiss</button>
          </div>
          <p className="mt-1 text-xs text-green-700">
            For security this is the only time the full secret is shown. Store it on your server to verify signatures.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-white px-3 py-2 font-mono text-xs text-gray-700">{revealed.secret}</code>
            <button onClick={copySecret} className="rounded-lg bg-white p-2 text-green-700 shadow-sm" aria-label="Copy secret">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={create} className="space-y-4 rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
          <h2 className="font-bold">Add a webhook endpoint</h2>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Endpoint URL</span>
            <input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} required
              type="url" placeholder="https://example.com/webhooks/toropay" autoComplete="off" spellCheck={false}
              className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-gray-500" />
            <span className="mt-1 block text-xs text-gray-400">Must be a public https URL. We never send to private or local addresses.</span>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Mode</span>
            <select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value as 'test' | 'live' })}
              className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none">
              <option value="live">Live — real payments and orders</option>
              <option value="test">Test — sandbox only</option>
            </select>
          </label>

          <fieldset>
            <legend className="mb-2 flex items-center justify-between text-xs font-semibold text-gray-500">
              <span>Events to send</span>
              <button type="button" onClick={() => setForm(f => ({ ...f, eventTypes: allSelected ? [] : EVENT_OPTIONS.map(o => o.value) }))}
                className="text-xs font-semibold text-gray-500 hover:text-charcoal">
                {allSelected ? 'Clear all' : 'Select all'}
              </button>
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {EVENT_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-sm">
                  <input type="checkbox" checked={form.eventTypes.includes(opt.value)} onChange={() => toggleEvent(opt.value)} />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={saving || form.eventTypes.length === 0}>
            {saving ? 'Creating…' : 'Create endpoint'}
          </Button>
        </form>
      )}

      {failed ? (
        <LoadError what="your webhook endpoints" onRetry={load} />
      ) : loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : endpoints.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-500">
          No endpoints yet. Add one to start receiving events on your server.
        </div>
      ) : (
        <div className="space-y-3">
          {endpoints.map(endpoint => (
            <EndpointCard key={endpoint.id} endpoint={endpoint} onChange={load} />
          ))}
        </div>
      )}
    </div>
  )
}
