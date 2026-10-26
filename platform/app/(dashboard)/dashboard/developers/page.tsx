'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Copy, Check, Plus, RotateCcw, Trash2, KeyRound } from 'lucide-react'
import { api } from '@/lib/api'
import { WEBHOOK_EVENTS } from '@/lib/webhook-events'
import { Button } from '@/components/ui/button'
import { LoadError } from '@/components/ui/load-error'

/** The webhook signing secret (moved here from Settings). Saving sends only this setting. */
function WebhookSecret() {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [secret, setSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function load() {
    setState('loading')
    api.getSettings()
      .then(s => { setSecret(String(s.webhook_secret ?? '')); setState('ready') })
      .catch(() => setState('failed'))
  }

  useEffect(() => { load() }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (state !== 'ready' || saving) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const { settings } = await api.saveSettings({ webhook_secret: secret })
      setSecret(String(settings.webhook_secret ?? ''))
      setMessage('Webhook secret saved')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save the webhook secret')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
      <h2 className="mb-1 font-bold">Webhook signing secret</h2>
      <p className="mb-4 text-sm text-gray-500">
        Every webhook is signed in the X-ToroPay-Signature header. To check signatures on your server,
        enter your own secret here and use the same value there.
      </p>
      {state === 'failed' && <LoadError what="your webhook secret" onRetry={load} />}
      {state === 'loading' && <p className="text-sm text-gray-500">Loading…</p>}
      {state === 'ready' && (
        <form onSubmit={save} className="space-y-3">
          <label htmlFor="webhook-secret" className="sr-only">Webhook signing secret</label>
          <input id="webhook-secret" value={secret} onChange={e => setSecret(e.target.value)} autoComplete="off" spellCheck={false}
            placeholder="Created automatically with your first webhook"
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm outline-none focus:border-gray-500" />
          {error && <p role="alert" className="text-sm text-red-600">Couldn&apos;t save: {error}</p>}
          {message && <p role="status" className="text-sm text-green-700">{message}</p>}
          <Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving…' : 'Save secret'}</Button>
        </form>
      )}
    </section>
  )
}

/** The server-side contract for every outgoing webhook, kept beside the keys. */
function WebhookPayloadDocs() {
  return (
    <section className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-bold">Webhook payload format</h2>
          <p className="mt-1 text-sm text-gray-500">
            ToroPay POSTs JSON to your endpoint. Every event has the same envelope; only the event type and data change.
          </p>
        </div>
        <Link href="/dashboard/developers/webhook-logs" className="text-xs font-semibold text-gray-600 hover:text-charcoal">
          View delivery logs →
        </Link>
      </div>

      <pre className="mt-4 overflow-x-auto rounded-xl bg-gray-900 p-4 text-[11px] leading-5 text-gray-100">{`{
  "id": "evt_abc123",
  "type": "payment.confirmed",
  "created_at": "2026-10-27T10:30:00.000Z",
  "data": {
    "transaction_id": "txn_...",
    "txn_id": "TP-TXN-...",
    "amount": 1499,
    "status": "success",
    "customer_name": "Asha Rao",
    "customer_phone": "9876543210",
    "payment_app": "Google Pay",
    "link_id": "...",
    "link_title": "October invoice"
  }
}`}</pre>

      <h3 className="mt-5 text-sm font-bold">Headers</h3>
      <ul className="mt-2 space-y-1 text-sm text-gray-600">
        <li><code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">Content-Type: application/json</code></li>
        <li><code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">X-ToroPay-Event: payment.confirmed</code> — the same value as <code className="font-mono text-xs">type</code></li>
        <li><code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">X-ToroPay-Signature: &lt;hex&gt;</code> — HMAC SHA-256 of the raw request body using your signing secret</li>
      </ul>

      <h3 className="mt-5 text-sm font-bold">Events</h3>
      <p className="mt-1 text-xs text-gray-500">
        These are the endpoint triggers. A payment link that still uses its own per-link webhook URL receives the older
        <code className="mx-1 rounded bg-white px-1 py-0.5 font-mono">payment.success</code> /
        <code className="mx-1 rounded bg-white px-1 py-0.5 font-mono">payment.failed</code> payload instead.
      </p>
      <div className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white/60">
        {WEBHOOK_EVENTS.map(event => (
          <div key={event.value} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-baseline sm:gap-3">
            <code className="w-56 shrink-0 font-mono text-xs font-semibold text-gray-700">{event.value}</code>
            <span className="text-xs text-gray-500">{event.description}</span>
          </div>
        ))}
      </div>

      <h3 className="mt-5 text-sm font-bold">Verify the signature</h3>
      <p className="mt-1 text-sm text-gray-600">
        Compare the signature in constant time. Use the exact raw body bytes — parsing and re-serialising JSON can change them.
      </p>
      <pre className="mt-2 overflow-x-auto rounded-xl bg-gray-900 p-4 text-[11px] leading-5 text-gray-100">{`const crypto = require('crypto')

const expected = crypto
  .createHmac('sha256', process.env.TOROPAY_WEBHOOK_SECRET)
  .update(rawBody)
  .digest('hex')

const received = req.headers['x-toropay-signature'] || ''
if (expected.length !== received.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
  return res.status(400).end()
}`}</pre>

      <p className="mt-4 text-xs text-gray-500">
        Failed deliveries are retried automatically with backoff. Open{' '}
        <Link href="/dashboard/developers/webhook-logs" className="font-semibold text-gray-600 hover:underline">
          Webhook logs
        </Link>{' '}
        to inspect the payload, response and retry any delivery manually. See{' '}
        <Link href="/dashboard/webhooks" className="font-semibold text-gray-600 hover:underline">
          Webhooks
        </Link>{' '}
        to add or remove endpoints.
      </p>
    </section>
  )
}

interface ApiKey {
  id: string
  name: string
  key_prefix: string
  mode: 'test' | 'live'
  scopes: string[]
  expires_at: string | null
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

export default function DevelopersPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', mode: 'test' as 'test' | 'live', scope: 'secret' as 'secret' | 'publishable' })

  // Once-only display of a freshly created / rotated secret
  const [revealed, setRevealed] = useState<{ label: string; value: string } | null>(null)
  const [copied, setCopied] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const res = await fetch('/api/api-keys')
    setKeys(res.ok ? ((await res.json()) as ApiKey[]) : [])
    setLoading(false)
  }

  function copy(value: string, label: string) {
    navigator.clipboard.writeText(value)
    setCopied(label)
    setTimeout(() => setCopied(''), 1800)
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await fetch('/api/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = (await res.json()) as { error?: string; key?: string; prefix?: string }
    setSaving(false)
    if (!res.ok || !data.key) {
      setError(data.error || 'Failed to create key')
      return
    }
    setRevealed({ label: `${form.name || 'New key'} (${form.mode} · ${form.scope})`, value: data.key })
    setShowForm(false)
    setForm({ name: '', mode: 'test', scope: 'secret' })
    load()
  }

  async function rotate(key: ApiKey) {
    if (!window.confirm(`Rotate "${key.name}"? The old key is revoked immediately.`)) return
    const res = await fetch(`/api/api-keys/${key.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rotate' }),
    })
    const data = (await res.json()) as { key?: string }
    if (res.ok && data.key) {
      setRevealed({ label: `${key.name} — rotated`, value: data.key })
      load()
    }
  }

  async function revoke(key: ApiKey) {
    if (!window.confirm(`Revoke "${key.name}"? Requests using it will stop working immediately.`)) return
    await fetch(`/api/api-keys/${key.id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Developers</h1>
          <p className="text-sm text-gray-500">
            Secret API keys authenticate merchant API + webhook calls. Test keys hit your sandbox; live keys move real money.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setShowForm(s => !s)}>
          <Plus className="mr-1.5 h-4 w-4" /> New key
        </Button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {revealed && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-green-800">{revealed.label}</p>
            <button onClick={() => setRevealed(null)} className="text-xs text-green-700 hover:underline">Dismiss</button>
          </div>
          <p className="mt-1 text-xs text-green-700">Copy it now — for security this is the only time the full secret is shown.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-white px-3 py-2 font-mono text-xs text-gray-700">{revealed.value}</code>
            <button onClick={() => copy(revealed.value, revealed.label)} className="rounded-lg bg-white p-2 text-green-700 shadow-sm" aria-label="Copy">
              {copied === revealed.label ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={create} className="space-y-4 rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
          <h2 className="font-bold">Create an API key</h2>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Name</span>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="My website" required
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
              <span className="mb-1 block text-xs font-semibold text-gray-500">Scope</span>
              <select value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value as 'secret' | 'publishable' })}
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none">
                <option value="secret">Secret (read + write)</option>
                <option value="publishable">Publishable (browser-safe)</option>
              </select>
            </label>
          </div>
          <p className="text-xs text-gray-500">
            Publishable keys are safe to embed in client-side code and never carry write access.
          </p>
          <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create key'}</Button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : keys.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-500">
          No keys yet. Create one to start calling the orders API.
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map(key => (
            <div key={key.id} className="rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-gray-500" />
                    <p className="font-bold">{key.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${key.mode === 'test' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{key.mode}</span>
                    {key.revoked_at && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-600">Revoked</span>
                    )}
                  </div>
                  <code className="mt-1 block font-mono text-xs text-gray-500">{key.key_prefix}…</code>
                  <p className="mt-1 text-xs text-gray-500">
                    {key.scopes.join(', ')}
                    {key.last_used_at
                      ? ` · last used ${new Date(key.last_used_at).toLocaleString('en-IN')}`
                      : ' · never used'}
                    {key.expires_at ? ` · expires ${new Date(key.expires_at).toLocaleDateString('en-IN')}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => copy(key.key_prefix, key.id)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-charcoal" aria-label="Copy prefix">
                    {copied === key.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                  {!key.revoked_at && (
                    <>
                      <button onClick={() => rotate(key)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-charcoal" aria-label="Rotate">
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button onClick={() => revoke(key)} className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-500" aria-label="Revoke">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <WebhookSecret />
      <WebhookPayloadDocs />
    </div>
  )
}