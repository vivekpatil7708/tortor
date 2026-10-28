'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  Repeat,
  Search,
  XCircle,
} from 'lucide-react'
import { api, type SubscriptionRow } from '@/lib/api'
import { billingDayLabel, frequencyLabel } from '@/lib/subscription-plan'
import { formatMoney, formatShortDate } from '@/lib/ui-format'
import { Button } from '@/components/ui/button'
import { Badge, statusTone } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadError } from '@/components/ui/load-error'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
  { key: 'cancelled', label: 'Cancelled' },
] as const

type Filter = (typeof FILTERS)[number]['key']

function subscriptionTone(status: string) {
  if (status === 'paused') return 'yellow' as const
  return statusTone(status)
}

export default function SubscriptionsPage() {
  const [rows, setRows] = useState<SubscriptionRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, SubscriptionRow>>({})
  const [detailLoading, setDetailLoading] = useState('')
  const [busyId, setBusyId] = useState('')
  const [actionError, setActionError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const result = await api.getSubscriptions()
      setRows(result.subscriptions)
      setTotal(result.total)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const counts = useMemo(() => ({
    active: rows.filter(row => row.status === 'active').length,
    paused: rows.filter(row => row.status === 'paused').length,
    cancelled: rows.filter(row => row.status === 'cancelled').length,
  }), [rows])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows.filter(row => {
      if (filter !== 'all' && row.status !== filter) return false
      if (!needle) return true
      return [row.plan_name, row.customer.full_name, row.customer.phone, row.customer.email]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(needle))
    })
  }, [rows, filter, search])

  async function loadDetail(id: string) {
    setDetailLoading(id)
    try {
      const result = await api.getSubscription(id)
      setDetails(prev => ({ ...prev, [id]: result.subscription }))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not load the payment history')
    } finally {
      setDetailLoading('')
    }
  }

  async function toggleHistory(row: SubscriptionRow) {
    if (openId === row.id) {
      setOpenId(null)
      return
    }
    setActionError('')
    setOpenId(row.id)
    if (!details[row.id]) await loadDetail(row.id)
  }

  async function changeStatus(row: SubscriptionRow, status: 'active' | 'paused' | 'cancelled') {
    if (status === 'cancelled' && !window.confirm(`Cancel the ${row.plan_name} subscription for ${row.customer.full_name}?`)) {
      return
    }
    setBusyId(row.id)
    setActionError('')
    try {
      await api.updateSubscription(row.id, { status })
      await load()
      if (openId === row.id) await loadDetail(row.id)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update the subscription')
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Subscriptions</h1>
          <p className="text-sm text-gray-500">
            Recurring plans, their payment links and every billing attempt.
          </p>
        </div>
        <Link
          href="/dashboard/customers"
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold text-charcoal transition-colors hover:bg-gray-50"
        >
          <Repeat className="h-3.5 w-3.5" /> Create from a customer
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-sm">
          <p className="text-2xl font-extrabold text-green-700">{counts.active}</p>
          <p className="text-xs text-gray-500">Active</p>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-sm">
          <p className="text-2xl font-extrabold text-amber-600">{counts.paused}</p>
          <p className="text-xs text-gray-500">Paused</p>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-sm">
          <p className="text-2xl font-extrabold text-gray-500">{counts.cancelled}</p>
          <p className="text-xs text-gray-500">Cancelled</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl bg-white/60 p-1">
          {FILTERS.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={
                filter === item.key
                  ? 'rounded-lg bg-charcoal px-3 py-1.5 text-xs font-semibold text-white'
                  : 'rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100'
              }
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search plan or customer"
            className="w-full rounded-xl border border-gray-200 bg-white/70 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-gray-500"
          />
        </label>
      </div>

      {actionError && <p role="alert" className="text-sm text-red-600">{actionError}</p>}

      {failed ? (
        <LoadError what="your subscriptions" onRetry={load} />
      ) : loading && rows.length === 0 ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : visible.length === 0 ? (
        <EmptyState
          title={rows.length ? 'No subscriptions match this view' : 'No subscriptions yet'}
          description={
            rows.length
              ? 'Try a different status or search.'
              : 'Open a customer and create a recurring plan from their profile.'
          }
          action={
            rows.length ? undefined : (
              <Link
                href="/dashboard/customers"
                className="inline-flex items-center justify-center rounded-xl bg-charcoal px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                Go to customers
              </Link>
            )
          }
        />
      ) : (
        <>
          <p className="text-xs text-gray-500">
            Showing {visible.length} of {total} subscription{total === 1 ? '' : 's'}
          </p>
          <div className="space-y-3">
            {visible.map(row => {
              const open = openId === row.id
              const detail = details[row.id]
              const payments = detail?.payments ?? []
              return (
                <div
                  key={row.id}
                  className="rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold">{row.plan_name}</p>
                        <Badge tone={subscriptionTone(row.status)}>{row.status}</Badge>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-gray-600">
                        {row.customer.full_name}
                        {row.customer.phone ? ` · ${row.customer.phone}` : ''}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                        <span className="font-semibold text-charcoal">
                          {formatMoney(row.amount)} / {frequencyLabel(row.frequency).toLowerCase()}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {row.status === 'cancelled' ? 'Cancelled' : 'Next'} {billingDayLabel(row.next_billing_date)}
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => toggleHistory(row)}
                        disabled={detailLoading === row.id}
                      >
                        {detailLoading === row.id ? 'Loading…' : 'History'}
                        {open ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />}
                      </Button>
                      {row.status !== 'cancelled' && (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busyId === row.id}
                            onClick={() => changeStatus(row, row.status === 'paused' ? 'active' : 'paused')}
                          >
                            {row.status === 'paused'
                              ? <><Play className="mr-1 h-3.5 w-3.5" /> Resume</>
                              : <><Pause className="mr-1 h-3.5 w-3.5" /> Pause</>}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busyId === row.id}
                            onClick={() => changeStatus(row, 'cancelled')}
                            className="text-red-600 hover:bg-red-50 hover:text-red-700"
                          >
                            <XCircle className="mr-1 h-3.5 w-3.5" /> Cancel
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {open && (
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Payment history</p>
                      {!detail ? (
                        <p className="text-sm text-gray-500">Loading…</p>
                      ) : payments.length === 0 ? (
                        <p className="text-sm text-gray-500">
                          No payments yet. A payment link is created on the next billing date.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {payments.map(payment => (
                            <div
                              key={payment.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/70 px-3 py-2 text-xs"
                            >
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className="font-semibold">{billingDayLabel(payment.billing_date)}</span>
                                <span>{formatMoney(payment.amount)}</span>
                                <Badge tone={statusTone(payment.status)}>{payment.status}</Badge>
                                {payment.paid_at && (
                                  <span className="text-gray-500">Paid {formatShortDate(payment.paid_at)}</span>
                                )}
                                {payment.failure_reason && (
                                  <span className="text-red-600">{payment.failure_reason}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                {payment.payment_link && (
                                  <a
                                    href={payment.payment_link.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-semibold text-blue-600 hover:underline"
                                  >
                                    Payment link
                                  </a>
                                )}
                                {payment.transaction && (
                                  <span className="text-gray-400">{payment.transaction.txn_id}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
