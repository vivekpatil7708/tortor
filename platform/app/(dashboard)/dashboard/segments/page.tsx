'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Save, Send, RefreshCw } from 'lucide-react'

interface SegmentRule {
  field: string
  operator: string
  value: string | number | boolean
}

interface SegmentPreset {
  id: string
  name: string
  match: 'all' | 'any'
  rules: SegmentRule[]
}

interface Evaluation {
  preset: SegmentPreset
  total: number
  customerIds: string[]
  preview: Array<{ id: string; email: string; name: string | null; totalSpent: number; totalOrders: number }>
}

const FIELDS = [
  { value: 'total_orders', label: 'Total orders' },
  { value: 'total_spent', label: 'Total spent (₹)' },
  { value: 'last_order_at', label: 'Last order date' },
  { value: 'created_before', label: 'Customer since (before)' },
  { value: 'created_after', label: 'Customer since (after)' },
  { value: 'marketing_consent', label: 'Marketing consent (yes/no)' },
  { value: 'opted_out_channel', label: 'Opted out of channel' },
]

const OPERATORS = ['gte', 'lte', 'gt', 'lt', 'eq', 'neq', 'in', 'not_in']

const OPERATOR_LABELS: Record<string, string> = {
  gte: '≥', lte: '≤', gt: '>', lt: '<', eq: '=', neq: '≠', in: 'in', not_in: 'not in',
}

function defaultRule(): SegmentRule {
  return { field: 'total_orders', operator: 'gte', value: 1 }
}

function newId() {
  return 'seg_' + Math.random().toString(36).slice(2, 10)
}

function jfetch<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  return fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  }).then(async res => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as { error?: string }).error ?? 'Request failed')
    }
    return res.json() as Promise<T>
  })
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/80 bg-white/60 p-3 backdrop-blur-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-xl font-bold text-charcoal">{value}</p>
    </div>
  )
}

export default function SegmentsPage() {
  const [presets, setPresets] = useState<SegmentPreset[]>([])
  const [rules, setRules] = useState<SegmentRule[]>([defaultRule()])
  const [match, setMatch] = useState<'all' | 'any'>('all')
  const [name, setName] = useState('')
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [channel, setChannel] = useState<'whatsapp' | 'instagram' | 'email'>('whatsapp')
  const [includeOptedOut, setIncludeOptedOut] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await jfetch<{ segments: SegmentPreset[] }>('/api/segments')
      setPresets(res.segments)
    } catch (e) {
      setMessage((e as Error).message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const updateRule = (index: number, patch: Partial<SegmentRule>) => {
    setRules(prev => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
    setEvaluation(null)
  }

  const evaluate = async (preset: SegmentPreset = { id: 'draft', name: name || 'Draft', match, rules }) => {
    setBusy(true)
    try {
      setEvaluation(await jfetch<Evaluation>('/api/segments/evaluate', { method: 'POST', body: JSON.stringify({ preset }) }))
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const savePreset = async () => {
    if (!name.trim()) { setMessage('Give the segment a name'); return }
    setBusy(true)
    try {
      await jfetch('/api/segments', { method: 'POST', body: JSON.stringify({ action: 'save', preset: { id: newId(), name, match, rules } }) })
      setMessage('Segment saved')
      await load()
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const deletePreset = async (id: string) => {
    try {
      await jfetch('/api/segments', { method: 'POST', body: JSON.stringify({ action: 'delete', id }) })
      await load()
    } catch (e) {
      setMessage((e as Error).message)
    }
  }

  const messageSegment = async () => {
    if (!evaluation) { setMessage('Evaluate the segment first'); return }
    setBusy(true)
    try {
      const result = await jfetch<{ total: number; sent: number; skipped: number; failed: number }>('/api/segments/message', {
        method: 'POST',
        body: JSON.stringify({ preset: evaluation.preset, channel, includeOptedOut }),
      })
      setMessage(`Sent ${result.sent} via ${channel} (${result.skipped} skipped, ${result.failed} failed)`)
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Customer Segments</h1>
        <p className="text-sm text-gray-500">Build reusable audience segments and message them over WhatsApp, Instagram, or email.</p>
      </div>

      {message && (
        <div className="mb-4 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-600">
          {message}
          <button onClick={() => setMessage('')} className="float-right text-gray-400 hover:text-charcoal">×</button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-700">Segment Builder</h2>
            <div className="flex gap-2">
              <button onClick={() => setMatch('all')} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${match === 'all' ? 'bg-charcoal text-white' : 'border border-gray-200 text-gray-500'}`}>Match all</button>
              <button onClick={() => setMatch('any')} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${match === 'any' ? 'bg-charcoal text-white' : 'border border-gray-200 text-gray-500'}`}>Match any</button>
            </div>
          </div>

          <div className="space-y-2">
            {rules.map((rule, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2">
                <select value={rule.field} onChange={e => updateRule(i, { field: e.target.value })}
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-charcoal">
                  {FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                <select value={rule.operator} onChange={e => updateRule(i, { operator: e.target.value })}
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-charcoal">
                  {OPERATORS.map(op => <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>)}
                </select>
                <input value={String(rule.value)} onChange={e => updateRule(i, { value: e.target.value })}
                  className="w-32 rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-charcoal" />
                <button onClick={() => setRules(prev => prev.filter((_, idx) => idx !== i))}
                  className="ml-auto rounded-lg p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <button onClick={() => setRules(prev => [...prev, defaultRule()])}
              className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 hover:text-charcoal">
              <Plus className="h-3.5 w-3.5" /> Add rule
            </button>
            <button onClick={() => evaluate()} disabled={busy}
              className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:text-charcoal disabled:opacity-50">
              <RefreshCw className="h-3.5 w-3.5" /> Evaluate
            </button>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Segment name"
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-xs outline-none focus:border-charcoal" />
            <button onClick={savePreset} disabled={busy}
              className="flex items-center gap-1 rounded-xl bg-charcoal px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
              <Save className="h-3.5 w-3.5" /> Save
            </button>
          </div>

          {evaluation && (
            <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <InfoCard label="Customers" value={String(evaluation.total)} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select value={channel} onChange={e => setChannel(e.target.value as typeof channel)}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-charcoal">
                    <option value="whatsapp">WhatsApp</option>
                    <option value="instagram">Instagram</option>
                    <option value="email">Email</option>
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    <input type="checkbox" checked={includeOptedOut} onChange={e => setIncludeOptedOut(e.target.checked)} />
                    Include opted-out
                  </label>
                  <button onClick={messageSegment} disabled={busy}
                    className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
                    <Send className="h-3.5 w-3.5" /> Message segment
                  </button>
                </div>
              </div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">Preview</p>
              {evaluation.preview.length === 0 ? (
                <p className="text-xs text-gray-400">No customers match.</p>
              ) : (
                <div className="space-y-1">
                  {evaluation.preview.map(c => (
                    <div key={c.id} className="flex justify-between text-xs">
                      <span className="text-gray-600">{c.name ?? c.email}</span>
                      <span className="text-gray-400">₹{c.totalSpent} · {c.totalOrders} orders</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
          <h2 className="mb-4 text-sm font-bold text-gray-700">Saved Segments</h2>
          {presets.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Nothing saved yet. Build a segment, evaluate it, then save.</p>
          ) : (
            <div className="space-y-2">
              {presets.map(p => (
                <div key={p.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-700">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.rules.length} rule{p.rules.length === 1 ? '' : 's'} · {p.match === 'all' ? 'match all' : 'match any'}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => { setName(p.name); setMatch(p.match); setRules(p.rules.map(r => ({ ...r }))) }}
                      className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:text-charcoal">Load</button>
                    <button onClick={() => deletePreset(p.id)} className="rounded-lg p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}