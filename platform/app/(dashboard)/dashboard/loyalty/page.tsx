'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Gift, History, Sparkles, Users } from 'lucide-react'
import { api, type LoyaltyData } from '@/lib/api'
import { loyaltyPointsForAmount, MAX_LOYALTY_RATE, MAX_MANUAL_POINTS } from '@/lib/loyalty-rules'
import { formatDateTime } from '@/lib/ui-format'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadError } from '@/components/ui/load-error'

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white/70 px-3.5 py-2.5 text-sm outline-none focus:border-gray-500'

export default function LoyaltyPage() {
  const [data, setData] = useState<LoyaltyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [message, setMessage] = useState('')

  const [rate, setRate] = useState('0')
  const [savingRate, setSavingRate] = useState(false)
  const [rateError, setRateError] = useState('')

  const [customerId, setCustomerId] = useState('')
  const [points, setPoints] = useState('')
  const [reason, setReason] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [adjustError, setAdjustError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const result = await api.getLoyalty()
      setData(result)
      setRate(String(result.settings.points_per_rupee))
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function flash(text: string) {
    setMessage(text)
    setTimeout(() => setMessage(''), 3500)
  }

  const selectedCustomer = useMemo(
    () => data?.customers.find(customer => customer.id === customerId) ?? null,
    [data, customerId],
  )

  const topBalances = useMemo(
    () => (data?.customers ?? [])
      .filter(customer => customer.balance !== 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 8),
    [data],
  )

  const currentRate = Number(rate)
  const preview = Number.isFinite(currentRate) ? loyaltyPointsForAmount(500, currentRate) : 0

  async function saveRate(e: React.FormEvent) {
    e.preventDefault()
    if (savingRate) return
    const value = Number(rate)
    if (!Number.isFinite(value) || value < 0 || value > MAX_LOYALTY_RATE) {
      setRateError(`Enter a rate from 0 to ${MAX_LOYALTY_RATE} points per ₹1.`)
      return
    }
    setSavingRate(true)
    setRateError('')
    try {
      const saved = await api.saveLoyaltyRate(value)
      setRate(String(saved.settings.points_per_rupee))
      setData(prev => prev ? { ...prev, settings: saved.settings } : prev)
      flash('Loyalty earning rate saved')
    } catch (err) {
      setRateError(err instanceof Error ? err.message : 'Could not save the earning rate')
    } finally {
      setSavingRate(false)
    }
  }

  async function adjust(e: React.FormEvent) {
    e.preventDefault()
    if (adjusting) return
    const value = Number(points)
    if (!customerId) {
      setAdjustError('Choose a customer')
      return
    }
    if (!Number.isInteger(value) || value === 0) {
      setAdjustError('Enter a whole number of points, positive to award or negative to deduct.')
      return
    }
    if (Math.abs(value) > MAX_MANUAL_POINTS) {
      setAdjustError(`Use at most ${MAX_MANUAL_POINTS.toLocaleString('en-IN')} points in one adjustment.`)
      return
    }
    if (!reason.trim()) {
      setAdjustError('Give a reason for the adjustment')
      return
    }

    setAdjusting(true)
    setAdjustError('')
    try {
      await api.adjustLoyaltyPoints({ customer_id: customerId, points: value, reason: reason.trim() })
      flash(value > 0 ? `${value} points added` : `${Math.abs(value)} points deducted`)
      setPoints('')
      setReason('')
      await load()
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : 'Could not adjust the points')
    } finally {
      setAdjusting(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Loyalty points</h1>
        <p className="text-sm text-gray-500">
          Reward repeat customers automatically, and correct balances by hand when needed.
        </p>
      </div>

      {failed ? (
        <LoadError what="loyalty points" onRetry={load} />
      ) : loading && !data ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : data ? (
        <>
          {message && (
            <div role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
              {message}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-sm">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                <Gift className="h-3.5 w-3.5" /> Outstanding balance
              </p>
              <p className="mt-1 text-2xl font-extrabold">{data.totals.balance.toLocaleString('en-IN')}</p>
              <p className="text-xs text-gray-500">points across all customers</p>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-sm">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                <ArrowUpRight className="h-3.5 w-3.5 text-green-600" /> Awarded
              </p>
              <p className="mt-1 text-2xl font-extrabold text-green-700">
                {data.totals.awarded.toLocaleString('en-IN')}
              </p>
              <p className="text-xs text-gray-500">points earned and added</p>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-sm">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                <ArrowDownRight className="h-3.5 w-3.5 text-red-500" /> Deducted
              </p>
              <p className="mt-1 text-2xl font-extrabold text-red-600">
                {data.totals.deducted.toLocaleString('en-IN')}
              </p>
              <p className="text-xs text-gray-500">points deducted by hand</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <form onSubmit={saveRate} className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 text-amber-500" />
                <div>
                  <h2 className="text-sm font-bold">Automatic earning</h2>
                  <p className="text-xs text-gray-500">
                    Points are added when a merchant confirms a payment, rounded down.
                  </p>
                </div>
              </div>
              <label className="mt-4 block">
                <span className="mb-1 block text-xs font-semibold text-gray-500">Points per ₹1 spent</span>
                <input
                  value={rate}
                  onChange={e => setRate(e.target.value)}
                  type="number"
                  min="0"
                  max={MAX_LOYALTY_RATE}
                  step="0.01"
                  required
                  className={inputClass}
                />
                <span className="mt-1 block text-xs text-gray-500">
                  Use 0.1 for 1 point per ₹10. Set 0 to stop earning points.
                </span>
              </label>
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Preview: a ₹500 payment earns <strong>{preview.toLocaleString('en-IN')}</strong> points.
              </p>
              {rateError && <p role="alert" className="mt-2 text-xs text-red-600">{rateError}</p>}
              <Button type="submit" size="sm" className="mt-3" disabled={savingRate}>
                {savingRate ? 'Saving…' : 'Save earning rate'}
              </Button>
            </form>

            <form onSubmit={adjust} className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
              <div className="flex items-start gap-2">
                <Users className="mt-0.5 h-4 w-4 text-blue-500" />
                <div>
                  <h2 className="text-sm font-bold">Award or deduct points</h2>
                  <p className="text-xs text-gray-500">
                    Use a negative number to take points away.
                  </p>
                </div>
              </div>
              {(data.customers.length === 0) ? (
                <p className="mt-4 rounded-xl bg-gray-50 px-3 py-3 text-xs text-gray-500">
                  Add a customer first, or wait for a confirmed payment to create one.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-gray-500">Customer</span>
                    <select
                      value={customerId}
                      onChange={e => setCustomerId(e.target.value)}
                      required
                      className={inputClass}
                    >
                      <option value="">Choose a customer</option>
                      {data.customers.map(customer => (
                        <option key={customer.id} value={customer.id}>
                          {customer.full_name} — {customer.balance.toLocaleString('en-IN')} points
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedCustomer && (
                    <p className="text-xs text-gray-500">
                      Current balance: <strong>{selectedCustomer.balance.toLocaleString('en-IN')}</strong> points
                    </p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-gray-500">Points</span>
                      <input
                        value={points}
                        onChange={e => setPoints(e.target.value)}
                        type="number"
                        step="1"
                        required
                        placeholder="e.g. 50 or -20"
                        className={inputClass}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-gray-500">Reason</span>
                      <input
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        maxLength={200}
                        required
                        placeholder="e.g. Birthday bonus"
                        className={inputClass}
                      />
                    </label>
                  </div>
                  {adjustError && <p role="alert" className="text-xs text-red-600">{adjustError}</p>}
                  <Button type="submit" size="sm" disabled={adjusting}>
                    {adjusting ? 'Applying…' : 'Apply adjustment'}
                  </Button>
                </div>
              )}
            </form>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
              <div className="mb-3 flex items-center gap-2">
                <History className="h-4 w-4 text-gray-500" />
                <h2 className="text-sm font-bold">Recent activity</h2>
              </div>
              {data.entries.length === 0 ? (
                <EmptyState
                  title="No points activity yet"
                  description="Points appear here after a confirmed payment or a manual adjustment."
                />
              ) : (
                <div className="space-y-1.5">
                  {data.entries.map(entry => (
                    <div
                      key={entry.id}
                      className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-white/70 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {entry.customer?.full_name || 'Deleted customer'}
                          <span className={`ml-2 font-bold ${entry.points > 0 ? 'text-green-700' : 'text-red-600'}`}>
                            {entry.points > 0 ? '+' : ''}{entry.points.toLocaleString('en-IN')}
                          </span>
                        </p>
                        <p className="truncate text-xs text-gray-500">{entry.reason}</p>
                      </div>
                      <span className="text-xs text-gray-400">{formatDateTime(entry.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
              <div className="mb-3 flex items-center gap-2">
                <Gift className="h-4 w-4 text-gray-500" />
                <h2 className="text-sm font-bold">Customer balances</h2>
              </div>
              {topBalances.length === 0 ? (
                <p className="text-sm text-gray-500">No customer has a points balance yet.</p>
              ) : (
                <div className="space-y-2">
                  {topBalances.map(customer => (
                    <div key={customer.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">{customer.full_name}</span>
                      <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold">
                        {customer.balance.toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 text-xs text-gray-400">
                Showing the highest balances among up to 500 customers.
              </p>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
