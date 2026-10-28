'use client'

import { useState } from 'react'
import { api, type SubscriptionRow } from '@/lib/api'
import { istDayKey } from '@/lib/ist-day'
import { SUBSCRIPTION_FREQUENCIES, SUBSCRIPTION_FREQUENCY_LABELS } from '@/lib/subscription-plan'
import { Button } from '@/components/ui/button'

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white/70 px-3.5 py-2.5 text-sm outline-none focus:border-gray-500'

export function SubscriptionForm({
  customerId,
  customerName,
  onCreated,
  onClose,
}: {
  customerId: string
  customerName: string
  onCreated: (subscription: SubscriptionRow) => void
  onClose: () => void
}) {
  const [planName, setPlanName] = useState('')
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState('monthly')
  const [nextBillingDate, setNextBillingDate] = useState(istDayKey(new Date()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const result = await api.createSubscription({
        customer_id: customerId,
        plan_name: planName,
        amount: Number(amount),
        frequency,
        next_billing_date: nextBillingDate,
      })
      onCreated(result.subscription)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the subscription')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-gray-200 bg-white/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold">New subscription</p>
          <p className="text-xs text-gray-500">For {customerName}</p>
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-gray-500">Plan name</span>
        <input
          value={planName}
          onChange={e => setPlanName(e.target.value)}
          maxLength={120}
          required
          placeholder="e.g. Monthly care plan"
          className={inputClass}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-500">Amount</span>
          <input
            value={amount}
            onChange={e => setAmount(e.target.value)}
            type="number"
            min="0.01"
            step="0.01"
            required
            placeholder="499"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-500">Billing frequency</span>
          <select value={frequency} onChange={e => setFrequency(e.target.value)} className={inputClass}>
            {SUBSCRIPTION_FREQUENCIES.map(value => (
              <option key={value} value={value}>
                {SUBSCRIPTION_FREQUENCY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-gray-500">Next billing date</span>
        <input
          value={nextBillingDate}
          onChange={e => setNextBillingDate(e.target.value)}
          type="date"
          required
          className={inputClass}
        />
        <span className="mt-1 block text-xs text-gray-400">
          A payment link goes out on this date. A reminder goes three days before.
        </span>
      </label>

      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Creating…' : 'Create subscription'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
