'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatAmount, formatDate } from '@/lib/utils'
import { Link2, Banknote, TrendingUp, CheckCircle2, Plus } from 'lucide-react'
import Link from 'next/link'
import { ConfirmDialog } from '@/components/ui/dialog'
import { LoadError } from '@/components/ui/load-error'
import { DonationCard } from '@/components/dashboard/donation-prompt'
import { NeedsAction } from '@/components/dashboard/needs-action'
import { useStatusAction } from '@/components/dashboard/status-action'
import { paymentHref, StatusBadge } from '@/components/dashboard/transaction-row'

/** How many "customer says paid" payments Overview lists; "View all" opens the rest. */
const NEEDS_ACTION_SHOWN = 10

export default function DashboardPage() {
  const [stats, setStats] = useState<{ totalLinks: number; totalTxns: number; totalRevenue: number; successRate: number | null; abandoned: number; paid: number }>(
    { totalLinks: 0, totalTxns: 0, totalRevenue: 0, successRate: null, abandoned: 0, paid: 0 }
  )
  const [recentTxns, setRecentTxns] = useState<Record<string, unknown>[]>([])
  const [recentState, setRecentState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [totalsFailed, setTotalsFailed] = useState(false)
  const [pendingFailed, setPendingFailed] = useState(false)
  const [merchant, setMerchant] = useState<Record<string, unknown> | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [pendingUpi, setPendingUpi] = useState<Record<string, unknown>[]>([])
  const [claimed, setClaimed] = useState<{ rows: Record<string, unknown>[]; total: number }>({ rows: [], total: 0 })
  const [confirmTarget, setConfirmTarget] = useState<Record<string, unknown> | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  // Confirm / Reject for link payments: afterwards, refresh everything that counts them.
  const statusAction = useStatusAction(() => { loadPending(); loadRecent(); loadTotals() })

  async function confirmUpi() {
    if (!confirmTarget || confirming) return
    setConfirming(true)
    setConfirmError('')
    try {
      await api.confirmUpiPayment(confirmTarget.id as string)
      setConfirmTarget(null)
      loadPending()
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Could not confirm the payment')
    } finally {
      setConfirming(false)
    }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function renderOrderDetails(t: Record<string, unknown>) {
    const cfv = t.custom_field_values as Record<string, unknown> | undefined
    if (!cfv) return null
    const products = cfv._selected_products as Array<{ name: string; price: string; category: string }> | undefined
    const note = t.customer_note as string | null
    const otherFields = Object.entries(cfv).filter(([k]) => k !== '_selected_products')
    if (!products?.length && !otherFields.length && !note) return null
    return (
      <div className="mt-2 space-y-1.5 border-t border-gray-100 pt-2">
        {products && products.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500">Products</p>
            {products.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded bg-gray-100 px-3 py-1 text-xs">
                <span>{p.name}{p.category ? ` (${p.category})` : ''}</span>
                <span className="font-medium">₹{p.price}</span>
              </div>
            ))}
          </div>
        )}
        {otherFields.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500">Custom Fields</p>
            {otherFields.map(([k, v]) => (
              <div key={k} className="rounded bg-gray-100 px-3 py-1 text-xs">
                <span className="text-gray-400">{k}:</span> {String(v)}
              </div>
            ))}
          </div>
        )}
        {note && <div className="rounded bg-gray-100 px-3 py-1 text-xs"><span className="text-gray-400">Note:</span> {note}</div>}
      </div>
    )
  }

  function loadRecent() {
    setRecentState('loading')
    api.getTransactions({ limit: 5 })
      .then(page => { setRecentTxns(page.transactions); setRecentState('ready') })
      .catch(() => setRecentState('failed'))
  }

  /** Payments waiting for you: link payments the customer marked as paid, and website-checkout UPI payments. */
  function loadPending() {
    Promise.allSettled([
      api.getPendingUpiPayments(),
      api.getTransactions({ status: 'pending', limit: NEEDS_ACTION_SHOWN }),
    ]).then(([checkout, links]) => {
      if (checkout.status === 'fulfilled') setPendingUpi(checkout.value.payments)
      if (links.status === 'fulfilled') {
        setClaimed({ rows: links.value.transactions, total: links.value.total ?? links.value.transactions.length })
      }
      setPendingFailed(checkout.status === 'rejected' || links.status === 'rejected')
    })
  }

  function loadTotals() {
    setTotalsFailed(false)
    // Totals are counted in the database, so they include every transaction.
    api.getAnalyticsSummary().then(summary => {
      setStats(s => ({
        ...s,
        totalTxns: Number(summary.total_orders) || 0,
        totalRevenue: Number(summary.gross_payment_volume) || 0,
        // Paid out of paid + rejected: abandoned checkouts don't count as failures.
        successRate: summary.success_rate == null ? null : Math.round(Number(summary.success_rate)),
        abandoned: Number(summary.abandoned_checkouts) || 0,
        paid: Number(summary.successful_payments) || 0,
      }))
    }).catch(() => setTotalsFailed(true))
  }

  useEffect(() => {
    api.me().then(({ merchant: m }) => setMerchant(m))
    api.getLinks().then(links => setStats(s => ({ ...s, totalLinks: links.length })))
    loadTotals()
    loadRecent()
    loadPending()
  }, [])

  const cards = [
    { label: 'Payment Links', value: stats.totalLinks, icon: Link2, bg: 'bg-blue-50', color: 'text-blue-600' },
    { label: 'Transactions', value: totalsFailed ? '—' : stats.totalTxns, icon: Banknote, bg: 'bg-green-50', color: 'text-green-600' },
    { label: 'Revenue', value: totalsFailed ? '—' : formatAmount(stats.totalRevenue), icon: TrendingUp, bg: 'bg-purple-50', color: 'text-purple-600' },
    {
      label: 'Success Rate',
      value: totalsFailed || stats.successRate === null ? '—' : `${stats.successRate}%`,
      note: !totalsFailed && stats.abandoned > 0 ? `${stats.abandoned} abandoned checkout${stats.abandoned === 1 ? '' : 's'} not counted` : undefined,
      icon: CheckCircle2, bg: 'bg-amber-50', color: 'text-amber-600',
    },
  ]

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome{merchant?.business_name ? `, ${merchant.business_name}` : ''}
          </h1>
          <p className="text-sm text-gray-500">Here&apos;s what&apos;s happening with your payments today.</p>
        </div>
        {/* Smaller screens have "+ New link" at the top of every page instead. */}
        <Link href="/dashboard/links/new"
          className="hidden items-center gap-1.5 rounded-xl bg-charcoal px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 lg:inline-flex">
          <Plus className="h-4 w-4" aria-hidden /> New payment link
        </Link>
      </div>

      {pendingFailed && <LoadError what="payments waiting for your confirmation" onRetry={loadPending} className="mb-8" />}
      <NeedsAction
        linkPayments={claimed.rows}
        linkTotal={claimed.total}
        checkoutPayments={pendingUpi}
        onAction={statusAction.ask}
        onConfirmCheckout={p => { setConfirmError(''); setConfirmTarget(p) }}
      />

      {/* Two by two on phones, so the totals don't push everything else down (U25). */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {cards.map(({ label, value, note, icon: Icon, bg, color }: { label: string; value: string | number; note?: string; icon: typeof Link2; bg: string; color: string }) => (
          <div key={label} className="rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-sm sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-gray-500 sm:text-sm">{label}</span>
              <div className={`${bg} ${color} hidden rounded-xl p-2.5 sm:block`}><Icon className="h-4 w-4" /></div>
            </div>
            <p className="mt-2 text-xl font-bold tracking-tight sm:mt-3 sm:text-2xl">{value}</p>
            {note && <p className="mt-1 text-xs text-gray-500">{note}</p>}
          </div>
        ))}
      </div>

      {totalsFailed && <LoadError what="your totals" onRetry={loadTotals} className="mb-8" />}

      <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">Recent Transactions</h2>
          <Link href="/dashboard/transactions" className="text-sm font-semibold text-primary-600 hover:underline">View all</Link>
        </div>
        {recentState === 'failed' ? (
          <p className="py-8 text-center text-sm text-gray-400">
            Couldn&apos;t load recent transactions. <button onClick={loadRecent} className="font-semibold text-charcoal underline">Retry</button>
          </p>
        ) : recentState === 'loading' ? (
          <p className="py-8 text-center text-sm text-gray-400">Loading…</p>
        ) : recentTxns.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No transactions yet. Create a payment link to get started.</p>
        ) : (
          <div className="space-y-3">
            {recentTxns.map((t) => {
              const tid = t.id as string
              const isExpanded = expanded.has(tid)
              const cfv = t.custom_field_values
              const hasDetails = !!(cfv && (cfv as Record<string, unknown>)._selected_products || (cfv && Object.keys(cfv as Record<string, unknown>).length > 0) || t.customer_note)
              return (
              <div key={tid} className="rounded-xl border border-gray-100 bg-white/50 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={paymentHref(t)} className="text-sm font-semibold hover:underline">
                      {(t.customer_name as string) || 'Anonymous'} · {(t.customer_phone as string) || '—'}
                    </Link>
                    <p className="break-words text-xs text-gray-400">{t.txn_id as string} · {formatDate(t.created_at as string)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold">{formatAmount(Number(t.amount))}</p>
                    <StatusBadge txn={t} />
                  </div>
                </div>
                {hasDetails && (
                  <button onClick={() => toggleExpand(tid)}
                    className="mt-1 text-xs font-semibold text-gray-400 hover:text-charcoal">
                    {isExpanded ? '▲ Hide' : '▼ Details'}
                  </button>
                )}
                {isExpanded && hasDetails && renderOrderDetails(t)}
              </div>
            )})}
          </div>
        )}
      </div>

      <DonationCard paidCount={totalsFailed ? 0 : stats.paid} />

      {statusAction.dialog}
      {confirmTarget && (
        <ConfirmDialog
          open
          onClose={() => { if (!confirming) setConfirmTarget(null) }}
          onConfirm={confirmUpi}
          title="Confirm payment?"
          message={`Only confirm if ${formatAmount(Number(confirmTarget.amount))} for ${confirmTarget.payment_reference as string} has reached your bank or UPI app.` + (confirmError ? ` Error: ${confirmError}` : '')}
          confirmLabel="Yes, I received it"
          busy={confirming}
        />
      )}
    </div>
  )
}
