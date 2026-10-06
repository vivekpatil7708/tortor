'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatAmount, formatDate, statusColor } from '@/lib/utils'
import { Link2, Banknote, TrendingUp, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { ConfirmDialog } from '@/components/ui/dialog'

export default function DashboardPage() {
  const [stats, setStats] = useState({ totalLinks: 0, totalTxns: 0, totalRevenue: 0, successRate: 0 })
  const [recentTxns, setRecentTxns] = useState<Record<string, unknown>[]>([])
  const [recentState, setRecentState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [merchant, setMerchant] = useState<Record<string, unknown> | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [pendingUpi, setPendingUpi] = useState<Record<string, unknown>[]>([])
  const [confirmTarget, setConfirmTarget] = useState<Record<string, unknown> | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState('')

  async function confirmUpi() {
    if (!confirmTarget || confirming) return
    setConfirming(true)
    setConfirmError('')
    try {
      await api.confirmUpiPayment(confirmTarget.id as string)
      setConfirmTarget(null)
      api.getPendingUpiPayments().then(({ payments }) => setPendingUpi(payments)).catch(() => {})
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

  useEffect(() => {
    api.me().then(({ merchant: m }) => setMerchant(m))
    api.getLinks().then(links => setStats(s => ({ ...s, totalLinks: links.length })))
    // Totals are counted in the database, so they include every transaction.
    api.getAnalyticsSummary().then(summary => {
      const total = Number(summary.total_orders) || 0
      const successful = Number(summary.successful_payments) || 0
      setStats(s => ({
        ...s,
        totalTxns: total,
        totalRevenue: Number(summary.gross_payment_volume) || 0,
        successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
      }))
    }).catch(() => {})
    loadRecent()
    api.getPendingUpiPayments().then(({ payments }) => setPendingUpi(payments)).catch(() => {})
  }, [])

  const cards = [
    { label: 'Payment Links', value: stats.totalLinks, icon: Link2, bg: 'bg-blue-50', color: 'text-blue-600' },
    { label: 'Transactions', value: stats.totalTxns, icon: Banknote, bg: 'bg-green-50', color: 'text-green-600' },
    { label: 'Revenue', value: formatAmount(stats.totalRevenue), icon: TrendingUp, bg: 'bg-purple-50', color: 'text-purple-600' },
    { label: 'Success Rate', value: `${stats.successRate}%`, icon: CheckCircle2, bg: 'bg-amber-50', color: 'text-amber-600' },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome{merchant?.business_name ? `, ${merchant.business_name}` : ''}
        </h1>
        <p className="text-sm text-gray-500">Here&apos;s what&apos;s happening with your payments today.</p>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, bg, color }) => (
          <div key={label} className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-500">{label}</span>
              <div className={`${bg} ${color} rounded-xl p-2.5`}><Icon className="h-4 w-4" /></div>
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
          </div>
        ))}
      </div>

      {pendingUpi.length > 0 && (
        <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50/60 p-6 backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-amber-900">UPI payments awaiting your confirmation</h2>
            <span className="rounded-full bg-amber-200/70 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              {pendingUpi.length}
            </span>
          </div>
          <div className="space-y-2">
            {pendingUpi.map(p => {
              const pid = p.id as string
              return (
                <div key={pid} className="flex items-center justify-between rounded-xl border border-amber-200/60 bg-white/60 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">{p.payment_reference as string}</p>
                    <p className="text-xs text-gray-400">
                      {(p.order_number as string ?? '' ? `Order ${p.order_number as string} · ` : '')}{formatDate(p.created_at as string)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-bold">{formatAmount(Number(p.amount))}</p>
                    <button onClick={() => { setConfirmError(''); setConfirmTarget(p) }}
                      className="rounded-xl bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700">
                      Confirm paid
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{(t.customer_name as string) || 'Anonymous'} · {(t.customer_phone as string) || '—'}</p>
                    <p className="text-xs text-gray-400">{t.txn_id as string} · {formatDate(t.created_at as string)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{formatAmount(Number(t.amount))}</p>
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor(t.status as string)}`}>
                      {t.status as string}
                    </span>
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
