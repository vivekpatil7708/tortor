'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Copy, Check, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ApiKey {
  id: string
  name: string
  key_prefix: string
  mode: 'test' | 'live'
  scopes: string[]
  revoked_at: string | null
}

export default function WebsiteIntegrationPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [createdKey, setCreatedKey] = useState<{ raw: string; key: ApiKey } | null>(null)
  const [copied, setCopied] = useState('')
  const [loading, setLoading] = useState(true)
  const [keysFailed, setKeysFailed] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'test' | 'live'>('test')

  function loadKeys() {
    setLoading(true)
    setKeysFailed(false)
    fetch('/api/api-keys')
      .then(r => { if (!r.ok) throw new Error('Could not load keys'); return r.json() })
      .then(setKeys)
      .catch(() => setKeysFailed(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadKeys() }, [])

  async function createKey() {
    setError('')
    const res = await fetch('/api/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Website', mode }),
    })
    if (!res.ok) {
      setError('Failed to create key')
      return
    }
    const data = (await res.json()) as { key: string; prefix: string }
    const created: ApiKey = {
      id: data.prefix,
      name: 'Website',
      key_prefix: data.prefix,
      mode,
      scopes: ['read', 'write'],
      revoked_at: null,
    }
    setCreatedKey({ raw: data.key, key: created })
    setKeys(prev => [created, ...prev])
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(text.slice(0, 24))
    setTimeout(() => setCopied(''), 1500)
  }

  const activeKey = keys.find(k => !k.revoked_at && k.mode === mode)

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://checkout.toropay.co.in'

  const snippet = `// Create an order at checkout time
const res = await fetch('${baseUrl}/api/v1/orders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ${activeKey ? activeKey.key_prefix + '…' : 'tp_' + mode + '_…'}',
    'x-toropay-mode': '${mode}',
  },
  body: JSON.stringify({
    merchant_order_reference: 'ORDER-1234',
    customer: { name: 'Ravi Sharma', email: 'ravi@example.com' },
    items: [{ name: 'Premium Plan', quantity: 1, unit_price: 1499 }],
    idempotency_key: 'my-unique-order-key',
  }),
})

const { checkout_url } = await res.json()
// Redirect the customer to checkout_url to complete payment`

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Website Integration</h1>
        <p className="text-sm text-gray-500">
          Add a hosted ToroPay checkout to your website or app. Create orders via our API, then send customers to their checkout page.
        </p>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold">1. Create an API key</h2>
            <p className="text-xs text-gray-500">Test keys never touch real money and only work on the test workspace.</p>
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1">
            {(['test', 'live'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${mode === m ? 'bg-white text-charcoal shadow-sm' : 'text-gray-500'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>

        {createdKey && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Your new key (shown once):</p>
            <code className="mt-1 block break-all font-mono text-xs">{createdKey.raw}</code>
            <button onClick={() => copy(createdKey.raw)}
              className="mt-2 flex items-center gap-1 text-xs font-semibold underline">
              {copied === createdKey.raw.slice(0, 24) ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} Copy key
            </button>
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white/70 px-4 py-3 text-sm">
          <span>
            {activeKey ? (
              <span className="font-mono text-xs text-gray-500">{activeKey.key_prefix}…</span>
            ) : loading ? (
              '…'
            ) : keysFailed ? (
              <span className="text-xs text-red-600">
                Couldn&apos;t load your keys. <button type="button" onClick={loadKeys} className="font-semibold underline">Try again</button>
              </span>
            ) : (
              <span className="text-xs text-gray-400">No {mode} key yet</span>
            )}
          </span>
          <Button type="button" size="sm" onClick={createKey}>
            {activeKey ? 'Create another' : `Create ${mode} key`}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
        <h2 className="mb-2 font-bold">2. Create a checkout session</h2>
        <p className="mb-4 text-xs text-gray-500">
          POST to <code className="font-mono">/api/v1/orders</code> with a bearer API key. The response includes{' '}
          <code className="font-mono">checkout_url</code> — redirect the customer there.
        </p>
        <div className="relative">
          <pre className="overflow-x-auto rounded-xl bg-charcoal p-4 text-xs leading-relaxed text-gray-100">
            <code>{snippet}</code>
          </pre>
          <button onClick={() => copy(snippet)} aria-label="Copy snippet"
            className="absolute right-3 top-3 rounded-lg bg-white/10 p-1.5 text-white/80 hover:bg-white/20">
            {copied === snippet.slice(0, 24) ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold">3. Print payment links manually</h2>
            <p className="text-xs text-gray-500">Create shareable checkout links from the dashboard — no code needed.</p>
          </div>
          <Link href="/dashboard/links" className="flex items-center gap-1.5 rounded-xl bg-charcoal px-4 py-2 text-xs font-semibold text-white hover:opacity-90">
            <ExternalLink className="h-3.5 w-3.5" /> Go to Payment Links
          </Link>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}