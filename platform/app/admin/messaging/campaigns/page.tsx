'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { LoadMore } from '@/components/admin/load-more'
import { CampaignStatusBadge } from '@/components/admin/status-badge'

interface Campaign {
  id: string
  name: string
  subject: string
  status: string
  audience: string
  total_count: number
  sent_count: number
  failed_count: number
  created_at: string
  sent_at: string | null
}

export default function AdminCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState<string | null>(null)

  const load = useCallback(async (nextCursor?: string | null) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '25' })
      if (nextCursor) params.set('cursor', nextCursor)
      const res = await fetch(`/api/admin/campaigns?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load campaigns')
      setCampaigns(prev => (nextCursor ? [...prev, ...(data.campaigns ?? [])] : (data.campaigns ?? [])))
      setCursor(data.next_cursor ?? null)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load campaigns')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function send(campaign: Campaign) {
    if (!window.confirm(`Send "${campaign.name}" to its audience now?`)) return
    setWorking(campaign.id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/campaigns/${campaign.id}/send`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not send the campaign')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the campaign')
    } finally {
      setWorking(null)
    }
  }

  async function remove(campaign: Campaign) {
    if (!window.confirm(`Delete the draft "${campaign.name}"?`)) return
    setWorking(campaign.id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/campaigns/${campaign.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not delete the campaign')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the campaign')
    } finally {
      setWorking(null)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-sm text-gray-500">Every broadcast you have written and sent.</p>
        </div>
        <Link
          href="/admin/messaging"
          className="rounded-xl bg-charcoal px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
        >
          New broadcast
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr>
              <th className="px-4 py-2.5 font-semibold text-gray-500">Campaign</th>
              <th className="px-4 py-2.5 font-semibold text-gray-500">Audience</th>
              <th className="px-4 py-2.5 font-semibold text-gray-500">Status</th>
              <th className="px-4 py-2.5 font-semibold text-gray-500">Sent</th>
              <th className="px-4 py-2.5 font-semibold text-gray-500">Created</th>
              <th className="px-4 py-2.5 font-semibold text-gray-500"></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map(c => (
              <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/messaging/campaigns/${c.id}`} className="font-medium text-charcoal hover:underline">
                    {c.name}
                  </Link>
                  <p className="text-xs text-gray-400">{c.subject}</p>
                </td>
                <td className="px-4 py-2.5 text-gray-500">{c.audience}</td>
                <td className="px-4 py-2.5"><CampaignStatusBadge status={c.status} /></td>
                <td className="px-4 py-2.5 text-gray-700">
                  {c.sent_count}/{c.total_count}
                  {c.failed_count > 0 && <span className="ml-1 text-xs text-red-600">({c.failed_count} failed)</span>}
                </td>
                <td className="px-4 py-2.5 text-gray-400">{new Date(c.created_at).toLocaleDateString('en-IN')}</td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-2">
                    {(c.status === 'draft' || c.status === 'sending') && (
                      <button
                        type="button"
                        onClick={() => send(c)}
                        disabled={working === c.id}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {working === c.id ? 'Working...' : c.status === 'sending' ? 'Continue' : 'Send'}
                      </button>
                    )}
                    {c.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => remove(c)}
                        disabled={working === c.id}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {campaigns.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No campaigns yet. Write one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <LoadMore cursor={cursor} onLoad={() => load(cursor)} loading={loading} className="mt-4" />
    </div>
  )
}
