'use client'

import { useEffect, useState } from 'react'
import { Copy, Check, Plus, RotateCcw, Trash2, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
        <p className="text-sm text-gray-400">Loading…</p>
      ) : keys.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400">
          No keys yet. Create one to start calling the orders API.
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map(key => (
            <div key={key.id} className="rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-gray-400" />
                    <p className="font-bold">{key.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${key.mode === 'test' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{key.mode}</span>
                    {key.revoked_at && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-600">Revoked</span>
                    )}
                  </div>
                  <code className="mt-1 block font-mono text-xs text-gray-500">{key.key_prefix}…</code>
                  <p className="mt-1 text-xs text-gray-400">
                    {key.scopes.join(', ')}
                    {key.last_used_at
                      ? ` · last used ${new Date(key.last_used_at).toLocaleString('en-IN')}`
                      : ' · never used'}
                    {key.expires_at ? ` · expires ${new Date(key.expires_at).toLocaleDateString('en-IN')}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => copy(key.key_prefix, key.id)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-charcoal" aria-label="Copy prefix">
                    {copied === key.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                  {!key.revoked_at && (
                    <>
                      <button onClick={() => rotate(key)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-charcoal" aria-label="Rotate">
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button onClick={() => revoke(key)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500" aria-label="Revoke">
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
    </div>
  )
}