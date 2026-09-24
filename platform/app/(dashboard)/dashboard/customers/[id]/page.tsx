'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, Input } from '@/components/ui/form'
import { Dialog, ConfirmDialog } from '@/components/ui/dialog'
import { formatMoney, formatShortDate } from '@/lib/ui-format'
import { ArrowLeft, Pencil, Plus, Trash2, MapPin, Phone, Mail } from 'lucide-react'

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<{ customer: any; addresses: any[]; orders: any[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ full_name: '', phone: '', email: '', tags: '' })

  const [addrOpen, setAddrOpen] = useState(false)
  const [addrForm, setAddrForm] = useState({ label: '', recipient_name: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '' })

  const [editAddr, setEditAddr] = useState<{ addressId: string } | null>(null)
  const [deleteAddr, setDeleteAddr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  function load() {
    setLoading(true)
    api.getCustomer(id)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  function openEdit() {
    if (!data) return
    setEditForm({
      full_name: data.customer.fullName ?? '',
      phone: data.customer.phone ?? '',
      email: data.customer.email ?? '',
      tags: (data.customer.tags ?? []).join(', '),
    })
    setEditOpen(true)
  }

  function openAddr(address?: any) {
    setEditAddr(address ? { addressId: address.id } : null)
    setAddrForm(address ? {
      label: address.label ?? '', recipient_name: address.recipientName ?? '', phone: address.phone ?? '',
      line1: address.line1 ?? '', line2: address.line2 ?? '', city: address.city ?? '',
      state: address.state ?? '', pincode: address.pincode ?? '',
    } : { label: 'Home', recipient_name: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '' })
    setAddrOpen(true)
  }

  async function saveEdit() {
    setBusy(true)
    try {
      await api.updateCustomer(id, {
        full_name: editForm.full_name,
        phone: editForm.phone || undefined,
        email: editForm.email || undefined,
        tags: editForm.tags ? editForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      })
      setEditOpen(false)
      setMsg('Customer updated')
      setTimeout(() => setMsg(''), 3000)
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function saveAddress() {
    setBusy(true)
    try {
      const body = {
        label: addrForm.label,
        recipient_name: addrForm.recipient_name,
        phone: addrForm.phone,
        line1: addrForm.line1,
        line2: addrForm.line2 || undefined,
        city: addrForm.city,
        state: addrForm.state,
        pincode: addrForm.pincode,
      }
      if (editAddr) {
        await api.updateAddress(id, editAddr.addressId, body)
      } else {
        await api.addAddress(id, body)
      }
      setAddrOpen(false)
      setMsg('Address saved')
      setTimeout(() => setMsg(''), 3000)
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function confirmDeleteAddress() {
    if (!deleteAddr) return
    setBusy(true)
    try {
      await api.deleteAddress(id, deleteAddr)
      setDeleteAddr(null)
      setMsg('Address deleted')
      setTimeout(() => setMsg(''), 3000)
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) return <div className="space-y-4"><Skeleton className="h-10 w-1/3" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>

  if (error || !data) {
    return (
      <div className="space-y-4">
        <button onClick={() => router.push('/dashboard/customers')} className="flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-charcoal"><ArrowLeft className="h-4 w-4" /> Back to customers</button>
        <EmptyState title="Customer not found" description={error || 'This customer does not exist.'} />
      </div>
    )
  }

  const c = data.customer

  return (
    <div className="space-y-5">
      {msg && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">{msg}</div>}

      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/dashboard/customers')} className="rounded-xl border border-gray-200 bg-white p-2 hover:bg-gray-50" aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold">{c.fullName}</h1>
            <button onClick={openEdit} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-charcoal" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-gray-500">
            {c.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {c.phone}</span>}
            {c.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {c.email}</span>}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {(c.tags ?? []).map((t: string) => <Badge key={t} tone="gray">{t}</Badge>)}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <h3 className="font-bold">Order history</h3>
            <span className="text-sm text-gray-500">{data.orders.length} order{data.orders.length === 1 ? '' : 's'}</span>
          </div>
          {data.orders.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">No orders yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {data.orders.map((o: any) => (
                <Link key={o.id} href={`/dashboard/orders/${o.id}`} className="block rounded-xl border border-gray-100 p-3 transition hover:border-charcoal/30 hover:bg-gray-50/60">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{o.orderNumber}</span>
                    <span className="font-bold">{formatMoney(o.totalAmount, o.currency)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <div className="flex gap-1.5">
                      <Badge>{o.orderStatus}</Badge>
                      <Badge>{o.paymentStatus}</Badge>
                    </div>
                    <span className="text-xs text-gray-400">{formatShortDate(o.createdAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h3 className="font-bold">Addresses</h3>
            <button onClick={() => openAddr()} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold hover:bg-gray-50">
              <Plus className="h-3.5 w-3.5" /> Add address
            </button>
          </div>
          {data.addresses.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">No saved addresses.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {data.addresses.map((a: any) => (
                <div key={a.id} className="rounded-xl border border-gray-100 p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      <MapPin className="h-3.5 w-3.5 text-gray-400" /> {a.label}
                      {a.isDefault && <Badge tone="blue">default</Badge>}
                    </span>
                    <div className="flex gap-1">
                      <button onClick={() => openAddr(a)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-charcoal" aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                      {!a.isDefault && (
                        <button onClick={() => setDeleteAddr(a.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500" aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-gray-600">
                    <p className="font-medium">{a.recipientName} · {a.phone}</p>
                    <p>{a.line1}{a.line2 ? `, ${a.line2}` : ''}</p>
                    <p>{a.city}, {a.state} — {a.pincode}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Edit customer */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} title="Edit customer">
        <div className="space-y-3">
          <Field label="Full name" required><Input value={editForm.full_name} onChange={e => setEditForm({ ...editForm, full_name: e.target.value })} /></Field>
          <Field label="Phone"><Input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} /></Field>
          <Field label="Tags (comma separated)"><Input value={editForm.tags} onChange={e => setEditForm({ ...editForm, tags: e.target.value })} /></Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditOpen(false)} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50">Cancel</button>
            <button onClick={saveEdit} disabled={busy} className="rounded-xl bg-charcoal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </Dialog>

      {/* Address form */}
      <Dialog open={addrOpen} onClose={() => setAddrOpen(false)} title={editAddr ? 'Edit address' : 'Add address'}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Label"><Input value={addrForm.label} onChange={e => setAddrForm({ ...addrForm, label: e.target.value })} /></Field>
          <Field label="Recipient name"><Input value={addrForm.recipient_name} onChange={e => setAddrForm({ ...addrForm, recipient_name: e.target.value })} /></Field>
          <Field label="Phone"><Input value={addrForm.phone} onChange={e => setAddrForm({ ...addrForm, phone: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="Address line 1"><Input value={addrForm.line1} onChange={e => setAddrForm({ ...addrForm, line1: e.target.value })} /></Field></div>
          <div className="sm:col-span-2"><Field label="Address line 2"><Input value={addrForm.line2} onChange={e => setAddrForm({ ...addrForm, line2: e.target.value })} /></Field></div>
          <Field label="City"><Input value={addrForm.city} onChange={e => setAddrForm({ ...addrForm, city: e.target.value })} /></Field>
          <Field label="State"><Input value={addrForm.state} onChange={e => setAddrForm({ ...addrForm, state: e.target.value })} /></Field>
          <Field label="Pincode"><Input value={addrForm.pincode} onChange={e => setAddrForm({ ...addrForm, pincode: e.target.value })} /></Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => setAddrOpen(false)} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50">Cancel</button>
          <button onClick={saveAddress} disabled={busy} className="rounded-xl bg-charcoal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!deleteAddr}
        onClose={() => setDeleteAddr(null)}
        onConfirm={confirmDeleteAddress}
        title="Delete address?"
        message="This address will be permanently removed from this customer."
        confirmLabel="Delete"
        danger
        busy={busy}
      />
    </div>
  )
}