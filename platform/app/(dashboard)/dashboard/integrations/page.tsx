'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, RefreshCw, ShieldCheck, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ShopifyState {
  connected: boolean
  store_domain: string | null
  webhook_secret: string | null
  topic_orders_create: boolean
  topic_orders_paid: boolean
  enabled: boolean
  webhook_url: string
  last_event_at: string | null
  last_error: string | null
}

const INITIAL: ShopifyState = {
  connected: false,
  store_domain: null,
  webhook_secret: null,
  topic_orders_create: true,
  topic_orders_paid: true,
  enabled: true,
  webhook_url: '',
  last_event_at: null,
  last_error: null,
}

export default function IntegrationsPage() {
  const [state, setState] = useState<ShopifyState>(INITIAL)
  const [storeDomain, setStoreDomain] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<'create' | 'paid' | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [testOrderId, setTestOrderId] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/integrations/shopify')
      .then(r => (r.ok ? r.json() : {}))
      .then(data => {
        const merged = { ...INITIAL, ...data }
        setState(merged)
        if (merged.store_domain) setStoreDomain(merged.store_domain)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function save(extra: Record<string, unknown> = {}) {
    setSaving(true)
    setMessage('')
    setError('')
    const res = await fetch('/api/integrations/shopify', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_domain: storeDomain || state.store_domain || undefined,
        topic_orders_create: state.topic_orders_create,
        topic_orders_paid: state.topic_orders_paid,
        enabled: state.enabled,
        ...extra,
      }),
    })
    const data = (await res.json()) as { connection?: ShopifyState; error?: string }
    setSaving(false)
    if (!res.ok || !data.connection) {
      setError(data.error || 'Failed to save')
      return
    }
    setState(data.connection)
    if (data.connection.store_domain) setStoreDomain(data.connection.store_domain)
    setMessage(extra.regenerate_secret ? 'New webhook secret generated — update it in Shopify.' : 'Saved.')
  }

  async function runTest(event: 'create' | 'paid') {
    setTesting(event)
    setMessage('')
    setError('')
    const fullEvent = event === 'create' ? 'orders/create' : 'orders/paid'
    const res = await fetch('/api/integrations/shopify/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: fullEvent, ...(event === 'paid' && testOrderId ? { order_id: testOrderId } : {}) }),
    })
    const data = (await res.json()) as {
      ok?: boolean
      error?: string
      checkout_url?: string
      order_id?: number
      changed?: boolean
      payment_id?: string
    }
    setTesting(null)
    if (!res.ok || !data.ok) {
      setError(data.error || 'Test event failed')
      return
    }
    if (data.order_id) setTestOrderId(data.order_id)
    if (event === 'create') {
      setMessage(`Test order created. Opening the secure checkout…`)
      if (data.checkout_url) window.open(data.checkout_url, '_blank')
    } else {
      setMessage(data.changed ? 'Payment marked as paid.' : 'Payment was already paid.')
    }
  }

  function copySecret() {
    if (!state.webhook_secret) return
    navigator.clipboard.writeText(state.webhook_secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Integrations</h1>
        <p className="text-sm text-gray-500">Connect your storefront so ToroPay can create checkouts and confirm payments automatically.</p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`rounded-xl p-2.5 ${state.connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                <Store className="h-5 w-5" />
              </div>
              <div>
                <p className="font-bold">Shopify</p>
                <p className="text-xs text-gray-500">
                  {state.connected && state.store_domain
                    ? `Connected · ${state.store_domain}`
                    : 'Not connected yet'}
                </p>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${state.connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {state.connected ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">Shopify store domain *</span>
              <input
                value={storeDomain}
                onChange={e => setStoreDomain(e.target.value)}
                placeholder="your-store.myshopify.com"
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-gray-300"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-start gap-2 rounded-xl border border-gray-200 bg-white/50 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={state.topic_orders_create}
                  onChange={e => setState({ ...state, topic_orders_create: e.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold">Orders · create</span>
                  <span className="block text-xs text-gray-500">Auto-creates a ToroPay checkout with a live order summary when a Shopify order is placed.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-xl border border-gray-200 bg-white/50 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={state.topic_orders_paid}
                  onChange={e => setState({ ...state, topic_orders_paid: e.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold">Orders · paid</span>
                  <span className="block text-xs text-gray-500">Marks the matching ToroPay payment and order as paid automatically.</span>
                </span>
              </label>
            </div>

            {state.connected && (
              <>
                <div className="rounded-xl border border-gray-200 bg-white/50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Webhook URL</p>
                  <code className="mt-1 block truncate rounded-lg bg-gray-100 px-3 py-2 font-mono text-xs text-gray-700">{state.webhook_url}</code>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white/50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Webhook secret</p>
                    <button onClick={copySecret} className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-charcoal">
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <code className="mt-1 block truncate rounded-lg bg-gray-100 px-3 py-2 font-mono text-xs text-gray-700">{state.webhook_secret}</code>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => save({ regenerate_secret: true })} disabled={saving} variant="secondary">
                    <RefreshCw className="mr-1.5 h-4 w-4" /> Regenerate secret
                  </Button>
                  <Button type="button" onClick={() => runTest('create')} disabled={testing !== null} variant="secondary">
                    <ExternalLink className="mr-1.5 h-4 w-4" /> Test checkout
                  </Button>
                  <Button type="button" onClick={() => runTest('paid')} disabled={testing !== null || testOrderId === null} variant="secondary">
                    <ShieldCheck className="mr-1.5 h-4 w-4" /> Test paid
                  </Button>
                </div>
                {testOrderId !== null && (
                  <p className="text-xs text-gray-400">Test order id: {testOrderId} — “Test paid” marks that order&apos;s payment as paid.</p>
                )}

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
                  <p className="font-bold">How to connect (3 steps)</p>
                  <ol className="mt-1 list-decimal space-y-1 pl-4">
                    <li>Click Save above to connect this store.</li>
                    <li>Copy the <b>webhook URL</b>.</li>
                    <li>In Shopify go to <b>Settings → Notifications → Webhooks</b>, add two webhooks: topic <code>Orders create</code> and <code>Orders paid</code>, both pointing at the webhook URL above, using the <b>webhook secret</b> as the secret.</li>
                    <li>Hit “Test checkout” to see a live order summary, then “Test paid” to auto-confirm it.</li>
                  </ol>
                </div>
              </>
            )}
          </div>

          {message && <p className="mt-3 text-sm text-green-600">{message}</p>}
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
          {state.last_error && (
            <p className="mt-3 text-xs text-amber-600">Last event error: {state.last_error}</p>
          )}

          <Button type="button" onClick={() => save()} disabled={saving} className="mt-5 w-full">
            {saving ? 'Saving…' : state.connected ? 'Save changes' : 'Connect Shopify'}
          </Button>
        </div>
      )}
    </div>
  )
}