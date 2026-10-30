'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Audience } from '@/lib/broadcast-audience'

interface Merchant {
  id: string
  email: string
  business_name: string
  status: string
}

/**
 * Who a campaign goes to. The filters narrow the merchants down, and the
 * merchants picked by hand are added to whoever the filters match.
 */
export function AudienceBuilder({
  value,
  onChange,
  disabled = false,
}: {
  value: Audience
  onChange: (next: Audience) => void
  disabled?: boolean
}) {
  function set(patch: Partial<Audience>) {
    const next = { ...value, ...patch }
    // Empty fields are left out so they are not sent as blank filters.
    for (const key of Object.keys(next) as (keyof Audience)[]) {
      const v = next[key]
      if (v === '' || v === undefined || v === null) delete next[key]
    }
    onChange(next)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-500">Merchant status</span>
          <select
            value={value.status ?? ''}
            disabled={disabled}
            onChange={e => set({ status: e.target.value })}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-charcoal disabled:opacity-50"
          >
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-500">Joined between</span>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={value.createdFrom ?? ''}
              disabled={disabled}
              onChange={e => set({ createdFrom: e.target.value })}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-charcoal disabled:opacity-50"
            />
            <span className="text-xs text-gray-400">and</span>
            <input
              type="date"
              value={value.createdTo ?? ''}
              disabled={disabled}
              onChange={e => set({ createdTo: e.target.value })}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-charcoal disabled:opacity-50"
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-500">At least this many payments</span>
          <input
            type="number"
            min={0}
            value={value.minTransactions ?? ''}
            disabled={disabled}
            onChange={e => set({ minTransactions: e.target.value === '' ? undefined : Number(e.target.value) })}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-charcoal disabled:opacity-50"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-500">At most this many payments</span>
          <input
            type="number"
            min={0}
            value={value.maxTransactions ?? ''}
            disabled={disabled}
            onChange={e => set({ maxTransactions: e.target.value === '' ? undefined : Number(e.target.value) })}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-charcoal disabled:opacity-50"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
          <input
            type="checkbox"
            checked={value.onboardingComplete ?? false}
            disabled={disabled}
            onChange={e => set({ onboardingComplete: e.target.checked || undefined })}
            className="h-4 w-4 accent-primary-500"
          />
          Finished onboarding
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
          <input
            type="checkbox"
            checked={value.emailVerified ?? false}
            disabled={disabled}
            onChange={e => set({ emailVerified: e.target.checked || undefined })}
            className="h-4 w-4 accent-primary-500"
          />
          Verified email address
        </label>
      </div>

      <MerchantPicker
        selected={value.merchantIds ?? []}
        disabled={disabled}
        onChange={ids => set({ merchantIds: ids.length ? ids : undefined })}
      />
    </div>
  )
}

/**
 * Picks merchants by hand. The merchants are searched for as the admin types,
 * so the whole list is never loaded at once.
 */
function MerchantPicker({
  selected,
  disabled,
  onChange,
}: {
  selected: string[]
  disabled: boolean
  onChange: (ids: string[]) => void
}) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<Merchant[]>([])
  const [chosen, setChosen] = useState<Merchant[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const chosenIds = new Set(selected)
    setChosen(chosen)
  }, [selected])

  useEffect(() => {
    if (!term.trim()) {
      setResults([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/merchants?q=${encodeURIComponent(term.trim())}&limit=20`, {
          signal: controller.signal,
        })
        if (!res.ok) return
        const data = await res.json()
        setResults(data.merchants ?? [])
      } catch {
        // A cancelled search is not a failure worth showing.
      } finally {
        setLoading(false)
      }
    }, 350)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [term])

  const selectedSet = useMemo(() => new Set(selected), [selected])

  function toggle(merchant: Merchant) {
    const next = selectedSet.has(merchant.id)
      ? selected.filter(id => id !== merchant.id)
      : [...selected, merchant.id]
    onChange(next)
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
      <p className="mb-2 text-xs font-semibold text-gray-500">Merchants picked by hand</p>
      <p className="mb-2 text-[11px] text-gray-400">
        These are added to whoever the filters above match.
      </p>

      {chosen.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {chosen.map(m => (
            <button
              key={m.id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(m)}
              className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 ring-1 ring-gray-200 hover:ring-gray-400 disabled:opacity-50"
            >
              {m.business_name || m.email} ×
            </button>
          ))}
        </div>
      )}

      <input
        value={term}
        disabled={disabled}
        onChange={e => setTerm(e.target.value)}
        placeholder="Search merchants by name or email..."
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-charcoal disabled:opacity-50"
      />

      {loading && <p className="mt-2 text-[11px] text-gray-400">Searching...</p>}

      {!loading && results.length > 0 && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-gray-100 bg-white">
          {results.map(m => (
            <label
              key={m.id}
              className="flex cursor-pointer items-center gap-3 border-b border-gray-50 px-3 py-2 last:border-0 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={selectedSet.has(m.id)}
                onChange={() => toggle(m)}
                className="h-4 w-4 accent-primary-500"
              />
              <span className="flex-1">
                <span className="block text-xs font-medium text-gray-700">{m.business_name || m.email}</span>
                <span className="block text-[11px] text-gray-400">{m.email}</span>
              </span>
            </label>
          ))}
        </div>
      )}

      {!loading && term.trim() && results.length === 0 && (
        <p className="mt-2 text-[11px] text-gray-400">No merchants match “{term.trim()}”</p>
      )}
    </div>
  )
}
