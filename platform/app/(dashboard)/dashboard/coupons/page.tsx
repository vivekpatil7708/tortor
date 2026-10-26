'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatDateTime, formatMoney } from '@/lib/ui-format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadError } from '@/components/ui/load-error'
import { useToast } from '@/components/toast'
import { Plus, Search, Edit, Trash2, X } from 'lucide-react'

type Coupon = Record<string, unknown>

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'expired', label: 'Expired' },
  { value: 'exhausted', label: 'Used up' },
]

const emptyForm = {
  code: '',
  discount_type: 'percentage',
  discount_value: '',
  min_order_amount: '',
  max_uses: '',
  expires_at: '',
  is_active: true,
}

function toLocalInput(iso: unknown): string {
  if (!iso) return ''
  const d = new Date(String(iso))
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function discountLabel(c: Coupon): string {
  if (c.discount_type === 'percentage') return `${Number(c.discount_value)}% off`
  return `${formatMoney(Number(c.discount_value))} off`
}

function statusTone(status: unknown): 'green' | 'gray' | 'red' | 'yellow' {
  if (status === 'active') return 'green'
  if (status === 'expired') return 'red'
  if (status === 'exhausted') return 'yellow'
  return 'gray'
}

export default function CouponsPage() {
  const { toast } = useToast()
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Coupon | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoadState('loading')
    try {
      const res = await api.getCoupons('?page_size=100')
      setCoupons(res.coupons || [])
      setLoadState('ready')
    } catch {
      setLoadState('failed')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visible = coupons.filter(c => {
    const q = search.trim().toLowerCase()
    if (q && !String(c.code).toLowerCase().includes(q)) return false
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    return true
  })

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setModalOpen(true)
  }

  function openEdit(c: Coupon) {
    setEditing(c)
    setForm({
      code: String(c.code ?? ''),
      discount_type: String(c.discount_type ?? 'percentage'),
      discount_value: c.discount_value == null ? '' : String(c.discount_value),
      min_order_amount: c.min_order_amount == null ? '' : String(c.min_order_amount),
      max_uses: c.max_uses == null ? '' : String(c.max_uses),
      expires_at: toLocalInput(c.expires_at),
      is_active: c.is_active !== false,
    })
    setError('')
    setModalOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        code: form.code.trim().toUpperCase(),
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        min_order_amount: form.min_order_amount === '' ? null : Number(form.min_order_amount),
        max_uses: form.max_uses === '' ? null : Number(form.max_uses),
        expires_at: form.expires_at === '' ? null : new Date(form.expires_at).toISOString(),
        is_active: form.is_active,
      }
      if (editing) {
        await api.updateCoupon(String(editing.id), payload)
        toast('Coupon updated')
      } else {
        await api.createCoupon(payload)
        toast('Coupon created')
      }
      setModalOpen(false)
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save coupon')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(c: Coupon) {
    if (!confirm(`Delete coupon "${String(c.code)}"? Existing orders keep their discount.`)) return
    try {
      await api.deleteCoupon(String(c.id))
      toast('Coupon deleted')
      load()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to delete coupon')
    }
  }

  const labelClass = 'mb-1 block text-xs font-semibold text-gray-600'
  const inputClass = 'w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200'

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Coupons</h1>
          <p className="text-sm text-gray-500">Create discount codes for your checkout and order API.</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" /> New Coupon</Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden />
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by code" className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map(f => (
            <button key={f.value} onClick={() => setStatusFilter(f.value)} aria-pressed={statusFilter === f.value}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${statusFilter === f.value ? 'bg-charcoal text-white' : 'bg-white/70 text-gray-600 hover:bg-white'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loadState === 'failed' && <LoadError what="your coupons" onRetry={load} />}
      {loadState === 'loading' && <p className="py-12 text-center text-sm text-gray-500">Loading…</p>}
      {loadState === 'ready' && coupons.length === 0 && (
        <EmptyState title="No coupons yet" description="Create a code customers can enter at checkout, like WELCOME10 or FLAT100." action={<Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" /> New Coupon</Button>} />
      )}
      {loadState === 'ready' && coupons.length > 0 && visible.length === 0 && (
        <p className="rounded-2xl border border-white/80 bg-white/60 py-12 text-center text-sm text-gray-500">No coupons match your filters.</p>
      )}
      {loadState === 'ready' && visible.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-white/80 bg-white/60 backdrop-blur-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Discount</th>
                <th className="px-4 py-3">Min order</th>
                <th className="px-4 py-3">Uses</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(c => (
                <tr key={String(c.id)} className="border-t border-gray-100 hover:bg-white/70">
                  <td className="px-4 py-3 font-mono font-semibold">{String(c.code)}</td>
                  <td className="px-4 py-3">{discountLabel(c)}</td>
                  <td className="px-4 py-3 text-gray-600">{c.min_order_amount == null ? '—' : formatMoney(Number(c.min_order_amount))}</td>
                  <td className="px-4 py-3 text-gray-600">{String(c.used_count ?? 0)}{c.max_uses == null ? '' : ` / ${String(c.max_uses)}`}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{c.expires_at ? formatDateTime(String(c.expires_at)) : 'Never'}</td>
                  <td className="px-4 py-3"><Badge tone={statusTone(c.status)}>{String(c.status)}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(c)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-charcoal" aria-label={`Edit ${String(c.code)}`}><Edit className="h-4 w-4" /></button>
                      <button onClick={() => handleDelete(c)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600" aria-label={`Delete ${String(c.code)}`}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-8">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold">{editing ? 'Edit Coupon' : 'New Coupon'}</h2>
              <button onClick={() => setModalOpen(false)} className="rounded-lg p-1.5 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div>
                <label className={labelClass}>Code *</label>
                <input required value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s+/g, '') })} placeholder="WELCOME10" className={`${inputClass} font-mono uppercase`} />
                <p className="mt-1 text-xs text-gray-500">Letters, numbers, dashes and underscores. Customers enter it at checkout.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Discount type *</label>
                  <select value={form.discount_type} onChange={e => setForm({ ...form, discount_type: e.target.value })} className={inputClass}>
                    <option value="percentage">Percentage</option>
                    <option value="fixed">Fixed amount</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>{form.discount_type === 'percentage' ? 'Percentage off *' : 'Amount off (INR) *'}</label>
                  <input required type="number" min="0.01" max={form.discount_type === 'percentage' ? '100' : undefined} step="0.01" value={form.discount_value} onChange={e => setForm({ ...form, discount_value: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Minimum order (INR)</label>
                  <input type="number" min="0" step="0.01" value={form.min_order_amount} onChange={e => setForm({ ...form, min_order_amount: e.target.value })} placeholder="No minimum" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Maximum uses</label>
                  <input type="number" min="1" step="1" value={form.max_uses} onChange={e => setForm({ ...form, max_uses: e.target.value })} placeholder="Unlimited" className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Expires at</label>
                  <input type="datetime-local" value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })} className={inputClass} />
                  <p className="mt-1 text-xs text-gray-500">Leave blank for a coupon that never expires.</p>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="coupon_active" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                  <label htmlFor="coupon_active" className="text-sm">Active</label>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Update Coupon' : 'Create Coupon'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
