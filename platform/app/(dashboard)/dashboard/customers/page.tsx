'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TableSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, Input } from '@/components/ui/form'
import { Dialog } from '@/components/ui/dialog'
import { formatShortDate } from '@/lib/ui-format'
import { Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react'

export default function CustomersPage() {
  const router = useRouter()
  const [customers, setCustomers] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState({ full_name: '', phone: '', email: '', tags: '' })
  const pageSize = 20

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
      if (debouncedSearch) params.set('search', debouncedSearch)
      const res = await api.getCustomers(`?${params.toString()}`)
      setCustomers(res.customers)
      setTotal(res.total)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch])

  useEffect(() => { load() }, [load])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  async function createCustomer() {
    setBusy(true)
    try {
      const res = await api.createCustomer({
        full_name: form.full_name,
        phone: form.phone || undefined,
        email: form.email || undefined,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      })
      setCreateOpen(false)
      setForm({ full_name: '', phone: '', email: '', tags: '' })
      router.push(`/dashboard/customers/${res.customer.id}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Customers</h1>
          <p className="text-sm text-gray-500">{loading ? 'Loading…' : `${total} customer${total === 1 ? '' : 's'}`}</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 rounded-xl bg-charcoal px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
          <Plus className="h-4 w-4" /> Add customer
        </button>
      </div>

      <Card className="p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search by name / phone / email"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>
      </Card>

      {loading && customers.length === 0 ? (
        <Card><TableSkeleton rows={7} cols={4} /></Card>
      ) : error && customers.length === 0 ? (
        <EmptyState title="Couldn't load customers" description={error} />
      ) : customers.length === 0 ? (
        <EmptyState
          title="No customers found"
          description="Add your first customer to start building your buyer list."
          action={<button onClick={() => setCreateOpen(true)} className="rounded-xl bg-charcoal px-4 py-2 text-sm font-semibold text-white">Add customer</button>}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Contact</th>
                  <th className="px-4 py-3 font-semibold">Orders</th>
                  <th className="px-4 py-3 font-semibold">Tags</th>
                  <th className="px-4 py-3 font-semibold">Since</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c: any) => (
                  <tr key={c.id} className="cursor-pointer border-b border-gray-50 transition hover:bg-gray-50/60" onClick={() => router.push(`/dashboard/customers/${c.id}`)}>
                    <td className="px-4 py-3 font-semibold">{c.fullName}</td>
                    <td className="px-4 py-3">
                      <span className="block text-gray-700">{c.phone}</span>
                      {c.email && <span className="text-gray-400">{c.email}</span>}
                    </td>
                    <td className="px-4 py-3">{c._count?.orders ?? c.orderCount ?? 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(c.tags ?? []).slice(0, 3).map((t: string) => <Badge key={t} tone="gray">{t}</Badge>)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatShortDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm">
            <span className="text-gray-500">Page {page} of {totalPages} · {total} results</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-1.5 font-semibold disabled:opacity-40 hover:bg-gray-50">
                <ChevronLeft className="h-4 w-4" /> Prev
              </button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-1.5 font-semibold disabled:opacity-40 hover:bg-gray-50">
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </Card>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Add customer">
        <div className="space-y-3">
          <Field label="Full name" required>
            <Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
          </Field>
          <Field label="Phone" required>
            <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Tags (comma separated)">
            <Input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="wholesale, priority" />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setCreateOpen(false)} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50">Cancel</button>
            <button onClick={createCustomer} disabled={busy || !form.full_name || !form.phone} className="rounded-xl bg-charcoal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? 'Adding…' : 'Add customer'}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}