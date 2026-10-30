'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { LoadMore } from '@/components/admin/load-more'
import { CampaignStatusBadge, MessageStatusBadge } from '@/components/admin/status-badge'

interface Campaign {
  id: string
  name: string
  subject: string
  body: string
  status: string
  audience_summary: string
  total_count: number
  sent_count: number
  failed_count: number
  pending_count: number
  feedback_count: number
  created_at: string
  sent_at: string | null
}

interface Recipient {
  id: string
  email: string
  business_name: string
  status: string
  sent_at: string | null
  delivered_at: string | null
  read_at: string | null
  error: string | null
}

/** How many recipients are listed at a time. */
const PAGE_SIZE = 100

export function AdminCampaignDetail({ id }: { id: string }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/campaigns/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load the campaign')
      setCampaign(data.campaign)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the campaign')
    } finally {
      setLoading(false)
    }
  }, [id])

  const loadRecipients = useCallback(
    async (nextOffset: number) => {
      try {
        const res = await fetch(`/api/admin/campaigns/${id}/recipients?offset=${nextOffset}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not load the recipients')
        setTotal(data.total)
        setRecipients(prev => (nextOffset === 0 ? (data.recipients ?? []) : [...prev, ...(data.recipients ?? [])]))
        setOffset(nextOffset)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load the recipients')
      }
    },
    [id]
  )

  useEffect(() => {
    load()
    loadRecipients(0)
  }, [load, loadRecipients])

  async function send() {
    if (!campaign) return
    if (!window.confirm(`Send "${campaign.name}" to its audience now?`)) return
    setWorking(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/campaigns/${campaign.id}/send`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not send the campaign')
      await load()
      await loadRecipients(0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the campaign')
    } finally {
      setWorking(false)
    }
  }

  if (error && !campaign) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
        <p className="font-semibold text-red-700">Could not load the campaign</p>
        <p className="mt-1 text-sm text-red-600">{error}</p>
      </div>
    )
  }

  if (!campaign) return <p className="text-sm text-gray-400">Loading...</p>

  const stats = [
    { label: 'Recipients', value: campaign.total_count },
    { label: 'Sent', value: campaign.sent_count },
    { label: 'Waiting', value: campaign.pending_count },
    { label: 'Failed', value: campaign.failed_count },
    { label: 'Feedback answers', value: campaign.feedback_count },
  ]

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/messaging/campaigns" className="text-xs font-semibold text-gray-400 hover:text-charcoal">
            &larr; All campaigns
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{campaign.name}</h1>
          <p className="text-sm text-gray-500">
            {campaign.subject} &middot; {campaign.audience_summary}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CampaignStatusBadge status={campaign.status} />
          {(campaign.status === 'draft' || campaign.status === 'sending') && (
            <button
              type="button"
              onClick={send}
              disabled={working}
              className="rounded-xl bg-primary-500 px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {working ? 'Sending...' : campaign.status === 'sending' ? 'Continue sending' : 'Send now'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(s => (
          <div key={s.label} className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-500">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-charcoal">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
        <p className="mb-2 text-xs font-semibold text-gray-400">MESSAGE</p>
        <p className="whitespace-pre-wrap text-sm text-gray-700">{campaign.body}</p>
      </div>

      <h2 className="mb-3 text-lg font-bold tracking-tight">Recipients ({total})</h2>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr>
              <th className="px-4 py-2.5 font-semibold text-gray-500">Merchant</th>
              <th className="px-4 py-2.5 font-semibold text-gray-500">Status</th>
              <th className="px-4 py-2.5 font-semibold text-gray-500">Sent</th>
              <th className="px-4 py-2.5 font-semibold text-gray-500">Delivered</th>
              <th className="px-4 py-2.5 font-semibold text-gray-500">Opened</th>
              <th className="px-4 py-2.5 font-semibold text-gray-500">Problem</th>
            </tr>
          </thead>
          <tbody>
            {recipients.map(r => (
              <tr key={r.id} className="border-b border-gray-50">
                <td className="px-4 py-2.5">
                  <p className="font-medium">{r.business_name}</p>
                  <p className="text-xs text-gray-400">{r.email}</p>
                </td>
                <td className="px-4 py-2.5"><MessageStatusBadge status={r.status} /></td>
                <td className="px-4 py-2.5 text-gray-500">{r.sent_at ? new Date(r.sent_at).toLocaleString('en-IN') : '—'}</td>
                <td className="px-4 py-2.5 text-gray-500">{r.delivered_at ? new Date(r.delivered_at).toLocaleString('en-IN') : '—'}</td>
                <td className="px-4 py-2.5 text-gray-500">{r.read_at ? new Date(r.read_at).toLocaleString('en-IN') : '—'}</td>
                <td className="px-4 py-2.5 text-xs text-red-600">{r.error ?? '—'}</td>
              </tr>
            ))}
            {recipients.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">No recipients yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {recipients.length < total && (
        <LoadMore
          cursor={String(offset + PAGE_SIZE)}
          onLoad={() => loadRecipients(offset + PAGE_SIZE)}
          className="mt-4"
        />
      )}
    </div>
  )
}
