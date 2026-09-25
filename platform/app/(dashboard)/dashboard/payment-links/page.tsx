'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Copy, Check, Plus, ExternalLink, Pause, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CheckoutLink {
  id: string
  slug: string
  title: string
  description: string | null
  mode: 'test' | 'live'
  amount: number | null
  amount_flexible: boolean
  min_amount: number | null
  max_amount: number | null
  product_name: string | null
  payment_count: number
  max_payments: number | null
  expiry_at: string | null
  active: boolean
  url: string
  created_at: string
}

export default function PaymentLinksPage() {
  const [links, setLinks] = useState<CheckoutLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [showForm, setShowForm] = useState(false)

  const [form, setForm] = useState({
    title: '',
    description: '',
    mode: 'test' as 'test' | 'live',
    amount: '',
    amount_flexible: false,
    min_amount: '',
    max_amount: '',
    max_payments: '',
    expiry_at: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/payment-links')
      .then(r => (r.ok ? r.json() : []))
      .then(setLinks)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function copy(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(''), 1500)
  }

  async function createLink(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await fetch('/api/payment-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        description: form.description || null,
        mode: form.mode,
        amount: form.amount ? Number(form.amount) : null,
        amount_flexible: form.amount_flexible,
        min_amount: form.min_amount ? Number(form.min_amount) : null,
        max_amount: form.max_amount ? Number(form.max_amount) : null,
        max_payments: form.max_payments ? Number(form.max_payments) : null,
        expiry_at: form.expiry_at ? new Date(form.expiry_at).toISOString() : null,
      }),
    })
    const data = (await res.json()) as { error?: string; link?: CheckoutLink }
    setSaving(false)
    if (!res.ok || !data.link) {
      setError(data.error || 'Failed to create link')
      return
    }
    setLinks(prev => [data.link!, ...prev])
    setShowForm(false)
    setForm({ title: '', description: '', mode: 'test', amount: '', amount_flexible: false, min_amount: '', max_amount: '', max_payments: '', expiry_at: '' })
  }

  async function toggleActive(link: CheckoutLink) {
    await fetch(`/api/payment-links/${link.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !link.active }),
    })
    setLinks(prev => prev.map(l => (l.id === link.id ? { ...l, active: !l.active } : l)))
  }

  async function removeLink(link: CheckoutLink) {
    if (!window.confirm(`Delete "${link.title}"? Existing orders are kept.`)) return
    await fetch(`/api/payment-links/${link.id}`, { method: 'DELETE' })
    setLinks(prev => prev.filter(l => l.id !== link.id))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Checkout Links</h1>
          <p className="text-sm text-gray-500">Shareable payment pages for your products and invoices.</p>
        </div>
        <Button type="button" onClick={() => setShowForm(s => !s)}>
          <Plus className="mr-1.5 h-4 w-4" /> New link
        </Button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {showForm && (
        <form onSubmit={createLink} className="space-y-4 rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
          <h2 className="font-bold">Create a checkout link</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-gray-500">Title *</span>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-gray-500">Description</span>
              <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">Mode</span>
              <select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value as 'test' | 'live' })}
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none">
                <option value="test">Test</option>
                <option value="live">Live</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">Amount (₹)</span>
              <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">Minimum (₹)</span>
              <input type="number" value={form.min_amount} onChange={e => setForm({ ...form, min_amount: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">Maximum (₹)</span>
              <input type="number" value={form.max_amount} onChange={e => setForm({ ...form, max_amount: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">Max payments</span>
              <input type="number" value={form.max_payments} onChange={e => setForm({ ...form, max_payments: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">Expires</span>
              <input type="datetime-local" value={form.expiry_at} onChange={e => setForm({ ...form, expiry_at: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.amount_flexible} onChange={e => setForm({ ...form, amount_flexible: e.target.checked })} />
            Let customers choose the amount
          </label>
          <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create link'}</Button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : links.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400">
          No checkout links yet — create your first to share a payment page.
        </div>
      ) : (
        <div className="space-y-3">
          {links.map(link => (
            <div key={link.id} className="rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-bold">{link.title}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${link.mode === 'test' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                      {link.mode}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${link.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {link.active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {link.amount ? `₹${link.amount.toLocaleString('en-IN')} · ` : link.amount_flexible ? 'Flexible amount · ' : ''}
                    {link.payment_count} payment{link.payment_count === 1 ? '' : 's'}
                    {link.max_payments ? ` / ${link.max_payments} max` : ''}
                    {link.expiry_at ? ` · expires ${new Date(link.expiry_at).toLocaleDateString('en-IN')}` : ''}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="truncate rounded-lg bg-gray-100 px-2 py-1 font-mono text-xs text-gray-600">{link.url}</code>
                    <button onClick={() => copy(link.url)} className="text-gray-400 hover:text-charcoal" aria-label="Copy link">
                      {copied === link.url ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Link href={`/paylink/${link.slug}`} target="_blank" className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-charcoal" aria-label="Open link">
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                  <button onClick={() => toggleActive(link)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-charcoal" aria-label="Pause or resume">
                    <Pause className="h-4 w-4" />
                  </button>
                  <button onClick={() => removeLink(link)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500" aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}