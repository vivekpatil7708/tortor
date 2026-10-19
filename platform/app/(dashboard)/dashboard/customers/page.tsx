'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, Plus, Trash2, Pencil, X, MapPin, Phone, Mail, ShoppingBag } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LoadError } from '@/components/ui/load-error'
import { EmptyState } from '@/components/ui/empty-state'

const PAGE_SIZE = 50
/** The longest search the server accepts. */
const MAX_SEARCH = 64

interface Customer {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  tags: string[]
  notes: string | null
  total_orders: number
  total_spent: number
  last_order_at: string | null
  marketing_consent: boolean
  address_count: number
  created_at: string
}

interface Address {
  id: string
  label: string | null
  recipient_name: string
  phone: string | null
  line1: string
  line2: string | null
  city: string
  state: string
  pincode: string
  country: string
  is_default: boolean
}

interface Order {
  id: string
  amount: number
  status: string
  created_at: string
}

const rupees = (n: number) =>
  `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

const asDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN') : '—')

/** The add/edit form. One customer at a time; closed by the parent. */
function CustomerForm({
  editing,
  onClose,
  onSaved,
}: {
  editing: Customer | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    full_name: editing?.full_name ?? '',
    phone: editing?.phone ?? '',
    email: editing?.email ?? '',
    notes: editing?.notes ?? '',
    tags: (editing?.tags ?? []).join(', '),
    marketing_consent: editing?.marketing_consent ?? false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    // Tags are typed as one comma separated line and stored as a list.
    const body = {
      full_name: form.full_name,
      phone: form.phone || null,
      email: form.email || null,
      notes: form.notes || null,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      marketing_consent: form.marketing_consent,
    }
    try {
      if (editing) await api.updateCustomer(editing.id, body)
      else await api.createCustomer(body)
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save the customer')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">{editing ? 'Edit customer' : 'Add a customer'}</h2>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-gray-500">Full name</span>
        <input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required
          className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-gray-500" />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-500">Phone</span>
          <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
            inputMode="tel" placeholder="+91 98765 43210"
            className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-gray-500" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-500">Email</span>
          <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
            type="email" autoComplete="off" spellCheck={false}
            className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-gray-500" />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-gray-500">Tags</span>
        <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })}
          placeholder="vip, repeat, wholesale"
          className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-gray-500" />
        <span className="mt-1 block text-xs text-gray-400">Separate tags with commas.</span>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-gray-500">Notes</span>
        <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3}
          className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-gray-500" />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.marketing_consent} onChange={e => setForm({ ...form, marketing_consent: e.target.checked })} />
        This customer agreed to receive marketing messages
      </label>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add customer'}</Button>
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  )
}

/** The slide-over that shows one customer's details, addresses and orders. */
function CustomerDetail({ id, onClose, onEdit, onChanged }: {
  id: string
  onClose: () => void
  onEdit: (c: Customer) => void
  onChanged: () => void
}) {
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [addresses, setAddresses] = useState<Address[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setFailed(false)
    api.getCustomer(id)
      .then(res => {
        setCustomer(res.customer as unknown as Customer)
        setAddresses(res.addresses as unknown as Address[])
        setOrders(res.orders as unknown as Order[])
        setLoading(false)
      })
      .catch(() => { setFailed(true); setLoading(false) })
  }, [id])

  useEffect(() => { load() }, [load])

  async function removeAddress(addressId: string) {
    if (!window.confirm('Remove this address?')) return
    setMessage('')
    try {
      await api.deleteAddress(id, addressId)
      load()
      onChanged()
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Could not remove the address')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-cream p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-extrabold">
            {loading ? 'Loading…' : customer?.full_name ?? 'Customer'}
          </h2>
          <div className="flex items-center gap-1">
            {customer && (
              <button onClick={() => onEdit(customer)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Edit customer">
                <Pencil className="h-4 w-4" />
              </button>
            )}
            <button onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {failed ? (
          <LoadError what="this customer" onRetry={load} className="mt-6" />
        ) : loading ? (
          <p className="mt-6 text-sm text-gray-500">Loading…</p>
        ) : customer ? (
          <div className="mt-4 space-y-5">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-white/70 p-3">
                <p className="text-lg font-extrabold">{customer.total_orders}</p>
                <p className="text-xs text-gray-500">Orders</p>
              </div>
              <div className="rounded-xl bg-white/70 p-3">
                <p className="text-lg font-extrabold">{rupees(customer.total_spent)}</p>
                <p className="text-xs text-gray-500">Spent</p>
              </div>
              <div className="rounded-xl bg-white/70 p-3">
                <p className="text-lg font-extrabold">{asDate(customer.last_order_at)}</p>
                <p className="text-xs text-gray-500">Last order</p>
              </div>
            </div>

            <div className="space-y-1 text-sm">
              {customer.phone && <p className="flex items-center gap-2 text-gray-700"><Phone className="h-4 w-4 text-gray-400" />{customer.phone}</p>}
              {customer.email && <p className="flex items-center gap-2 text-gray-700"><Mail className="h-4 w-4 text-gray-400" />{customer.email}</p>}
              <p className="flex items-center gap-2 text-gray-500">
                <ShoppingBag className="h-4 w-4 text-gray-400" />
                {customer.marketing_consent ? 'Accepts marketing messages' : 'No marketing consent'}
              </p>
            </div>

            {customer.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {customer.tags.map(tag => <Badge key={tag} tone="blue">{tag}</Badge>)}
              </div>
            )}

            {customer.notes && (
              <div className="rounded-xl bg-white/70 p-3 text-sm text-gray-600">
                <p className="mb-1 text-xs font-semibold text-gray-500">Notes</p>
                {customer.notes}
              </div>
            )}

            <div>
              <p className="mb-2 text-sm font-bold">Addresses</p>
              {addresses.length === 0 ? (
                <p className="text-sm text-gray-500">No saved addresses.</p>
              ) : (
                <div className="space-y-2">
                  {addresses.map(a => (
                    <div key={a.id} className="flex items-start justify-between gap-2 rounded-xl border border-gray-100 bg-white/60 p-3 text-sm">
                      <div className="flex gap-2">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                        <div>
                          <p className="flex items-center gap-2 font-semibold">
                            {a.recipient_name}
                            {a.is_default && <Badge tone="green">Default</Badge>}
                            {a.label && <span className="text-xs text-gray-400">{a.label}</span>}
                          </p>
                          <p className="text-gray-600">
                            {[a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ')}
                          </p>
                          {a.phone && <p className="text-xs text-gray-500">{a.phone}</p>}
                        </div>
                      </div>
                      <button onClick={() => removeAddress(a.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500" aria-label="Remove address">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-bold">Recent orders</p>
              {orders.length === 0 ? (
                <p className="text-sm text-gray-500">No orders yet.</p>
              ) : (
                <div className="space-y-1">
                  {orders.map(o => (
                    <div key={o.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white/60 px-3 py-2 text-sm">
                      <span className="text-gray-500">{asDate(o.created_at)}</span>
                      <span className="font-semibold">{rupees(o.amount)}</span>
                      <Badge>{o.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {message && <p role="status" className="text-sm text-red-600">{message}</p>}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function CustomersPage() {
  const [rows, setRows] = useState<Customer[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  // Search once typing pauses, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Only the newest request may update the list.
  const latest = useRef(0)
  const load = useCallback(async (cursor?: string) => {
    const call = ++latest.current
    setLoading(true)
    setFailed(false)
    if (!cursor) { setRows([]); setTotal(null); setNextCursor(null) }
    try {
      const page = await api.getCustomers({ q: query || undefined, limit: PAGE_SIZE, cursor })
      if (call !== latest.current) return
      const customers = page.customers as unknown as Customer[]
      setRows(prev => (cursor ? [...prev, ...customers] : customers))
      if (!cursor) setTotal(page.total)
      setNextCursor(page.next_cursor)
    } catch {
      if (call !== latest.current) return
      setFailed(true)
    } finally {
      if (call === latest.current) setLoading(false)
    }
  }, [query])

  useEffect(() => { load() }, [load])

  async function remove(c: Customer) {
    if (!window.confirm(`Delete ${c.full_name}? Their saved addresses are removed too. Past orders keep their history.`)) return
    try {
      await api.deleteCustomer(c.id)
      if (openId === c.id) setOpenId(null)
      load()
    } catch {
      // Leave the row in place; the next load shows the true state.
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Customers</h1>
          <p className="text-sm text-gray-500">
            Everyone who has bought from you, with what they spent and where they live.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => { setEditing(null); setShowForm(true) }}>
          <Plus className="mr-1.5 h-4 w-4" /> Add customer
        </Button>
      </div>

      <label className="relative block">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} maxLength={MAX_SEARCH}
          placeholder="Search by name, phone or email"
          className="w-full rounded-xl border border-gray-200 bg-white/70 py-3 pl-11 pr-4 text-sm outline-none focus:border-gray-500" />
      </label>

      {showForm && (
        <CustomerForm
          editing={editing}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSaved={() => { setShowForm(false); setEditing(null); load() }}
        />
      )}

      {failed ? (
        <LoadError what="your customers" onRetry={() => load()} />
      ) : loading && rows.length === 0 ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title={query ? 'No customers match that search' : 'No customers yet'}
          description={query ? 'Try a different name, phone number or email.' : 'Customers appear here as orders come in, or add one by hand.'}
        />
      ) : (
        <>
          {total !== null && (
            <p className="text-xs text-gray-500">{total} customer{total === 1 ? '' : 's'}</p>
          )}
          <div className="space-y-2">
            {rows.map(c => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-sm">
                <button onClick={() => setOpenId(c.id)} className="min-w-0 flex-1 text-left">
                  <p className="flex items-center gap-2 truncate font-bold">
                    {c.full_name}
                    {c.tags.map(tag => <Badge key={tag} tone="blue">{tag}</Badge>)}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {[c.phone, c.email].filter(Boolean).join(' · ') || 'No contact details'}
                  </p>
                </button>
                <div className="hidden shrink-0 text-right sm:block">
                  <p className="text-sm font-semibold">{rupees(c.total_spent)}</p>
                  <p className="text-xs text-gray-500">
                    {c.total_orders} order{c.total_orders === 1 ? '' : 's'} · {asDate(c.last_order_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => { setEditing(c); setShowForm(true) }} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label={`Edit ${c.full_name}`}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => remove(c)} className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-500" aria-label={`Delete ${c.full_name}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {nextCursor && (
            <div className="pt-1 text-center">
              <Button type="button" variant="secondary" size="sm" onClick={() => load(nextCursor)} disabled={loading}>
                {loading ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}

      {openId && (
        <CustomerDetail
          id={openId}
          onClose={() => setOpenId(null)}
          onEdit={c => { setEditing(c); setShowForm(true); setOpenId(null) }}
          onChanged={() => load()}
        />
      )}
    </div>
  )
}
