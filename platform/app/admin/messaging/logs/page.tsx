'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { LoadMore } from '@/components/admin/load-more'
import { MessageStatusBadge } from '@/components/admin/status-badge'

interface Log {
  id: string
  merchant_name: string
  recipient: string
  channel: string
  subject: string
  status: string
  campaign_id: string | null
  campaign_name: string | null
  open_count: number
  created_at: string
  sent_at: string | null
  delivered_at: string | null
  read_at: string | null
  error: string | null
}

const STATUSES = ['', 'pending', 'sent', 'delivered', 'read', 'failed']
const CHANNELS = ['', 'email', 'whatsapp', 'instagram']

export default function AdminDeliveryLogs() {
  const [logs, setLogs] = useState<Log[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [status, setStatus] = useState('')
  const [channel, setChannel] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')

  const load = useCallback(
    async (nextCursor?: string | null) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ limit: '50', broadcasts: 'true' })
        if (nextCursor) params.set('cursor', nextCursor)
        if (status) params.set('status', status)
        if (channel) params.set('channel', channel)
        if (from) params.set('from', from)
        if (to) params.set('to', to)
        if (appliedSearch) params.set('q', appliedSearch)

        const res = await fetch(`/api/admin/delivery-logs?${params}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not load the delivery log')
        setLogs(prev => (nextCursor ? [...prev, ...(data.logs ?? [])] : (data.logs ?? [])))
        setCursor(data.next_cursor ?? null)
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load the delivery log')
      } finally {
        setLoading(false)
      }
    },
    [status, channel, from, to, appliedSearch]
  )

  useEffect(() => {
    load()
  }, [load])

  // A search is run when the admin presses Enter, not as they type.
  useEffect(() => {
    if (search === appliedSearch) return
    const timer = setTimeout(() => setAppliedSearch(search), 500)
    return () => clearTimeout(timer)
  }, [search, appliedSearch])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Delivery log</h1>
        <p className="text-sm text-gray-500">
          What has been sent, and what happened to it afterwards. Merchant receipts are not shown here.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-500">Status</span>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-charcoal"
          >
            {STATUSES.map(s => <option key={s || 'any'} value={s}>{s || 'Any'}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-500">Channel</span>
          <select
            value={channel}
            onChange={e => setChannel(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-charcoal"
          >
            {CHANNELS.map(c => <option key={c || 'any'} value={c}>{c || 'Any'}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-500">From</span>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-charcoal"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-500">To</span>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-charcoal"
          />
        </label>

        <label className="block flex-1 min-w-[200px]">
          <span className="mb-1 block text-xs font-semibold text-gray-500">Search</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Recipient or subject..."
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-charcoal"
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr>
              <th className="px-4 py-2.5 font-semibold text-gray-500">Merchant</th>
              <th className="px-4 py-2.5 font-semibold text-gray-500">Subject</th>
              <th className="px-4 py-2.5 font-semibold text-gray-500">Status</th>
              <th className="px-4 py-2.5 font-semibold text-gray-500">Opens</th>
              <th className="px-4 py-2.5 font-semibold text-gray-500">Opened</th>
              <th className="px-4 py-2.5 font-semibold text-gray-500">Sent</th>
              <th className="px-4 py-2.5 font-semibold text-gray-500">Campaign</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <p className="font-medium">{log.merchant_name}</p>
                  <p className="text-xs text-gray-400">{log.recipient}</p>
                </td>
                <td className="px-4 py-2.5 text-gray-700">{log.subject || '—'}</td>
                <td className="px-4 py-2.5">
                  <MessageStatusBadge status={log.status} />
                  {log.error && <p className="mt-0.5 max-w-[160px] text-[11px] text-red-600">{log.error}</p>}
                </td>
                <td className="px-4 py-2.5 font-mono text-gray-700">{log.open_count}</td>
                <td className="px-4 py-2.5 text-gray-500">
                  {log.read_at ? new Date(log.read_at).toLocaleString('en-IN') : '—'}
                </td>
                <td className="px-4 py-2.5 text-gray-500">
                  {log.sent_at ? new Date(log.sent_at).toLocaleDateString('en-IN') : '—'}
                </td>
                <td className="px-4 py-2.5 text-gray-500">
                  {log.campaign_id ? (
                    <Link href={`/admin/messaging/campaigns/${log.campaign_id}`} className="hover:underline">
                      {log.campaign_name || 'Campaign'}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
            {logs.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">Nothing has been sent yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <LoadMore cursor={cursor} onLoad={() => load(cursor)} loading={loading} className="mt-4" />
    </div>
  )
}
