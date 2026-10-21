'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { FeedbackStatusBadge } from '@/components/admin/status-badge'
import { LoadMore } from '@/components/admin/load-more'
import { exportToCSV } from '@/lib/export-csv'
import { FEEDBACK_STATUSES } from '@/lib/feedback'

interface FeedbackResponse {
  id: string
  merchant_name: string
  merchant_id: string | null
  merchant_email: string | null
  campaign_id: string | null
  campaign_name: string | null
  satisfaction: number
  ease_of_use: number
  useful_parts: string[]
  ease_collecting: string
  likes_most: string | null
  issues: string | null
  improvement: string | null
  nps_score: number
  follow_up: boolean
  contact: string | null
  status: string
  admin_note: string | null
  reviewed_at: string | null
  created_at: string
}

interface Summary {
  total: number
  nps: number
  promoters: number
  passives: number
  detractors: number
  avg_satisfaction: number
  avg_ease_of_use: number
  follow_ups: number
}

function npsLabel(nps: number) {
  if (nps >= 50) return 'Excellent'
  if (nps >= 0) return 'Good'
  return 'Needs attention'
}

export default function AdminFeedback() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [responses, setResponses] = useState<FeedbackResponse[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [status, setStatus] = useState('')
  const [campaignId, setCampaignId] = useState('')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([])

  const load = useCallback(
    async (nextCursor?: string | null) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ limit: '25' })
        if (nextCursor) params.set('cursor', nextCursor)
        if (status) params.set('status', status)
        if (campaignId) params.set('campaign_id', campaignId)
        if (appliedSearch) params.set('q', appliedSearch)

        const res = await fetch(`/api/admin/feedback?${params}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load feedback')
        setSummary(data.summary)
        setResponses(prev => (nextCursor ? [...prev, ...(data.responses ?? [])] : (data.responses ?? [])))
        setCursor(data.next_cursor ?? null)
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load feedback')
      } finally {
        setLoading(false)
      }
    },
    [status, campaignId, appliedSearch]
  )

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    fetch('/api/admin/campaigns?limit=50')
      .then(r => (r.ok ? r.json() : null))
      .then(data => setCampaigns(data?.campaigns ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (search === appliedSearch) return
    const timer = setTimeout(() => setAppliedSearch(search), 500)
    return () => clearTimeout(timer)
  }, [search, appliedSearch])

  /** Marks a response as read, noted or actioned, without leaving the list. */
  async function update(id: string, patch: { status?: string; adminNote?: string }) {
    setError(null)
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save the change')
      setResponses(prev => prev.map(r => (r.id === id ? { ...r, ...data.feedback } : r)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the change')
    }
  }

  function handleExport() {
    exportToCSV(
      'toropay-feedback',
      [
        { key: 'created_at', label: 'Date' },
        { key: 'merchant_name', label: 'Business Name' },
        { key: 'merchant_email', label: 'Email' },
        { key: 'campaign_name', label: 'Campaign' },
        { key: 'status', label: 'Status' },
        { key: 'satisfaction', label: 'Satisfaction (1-5)' },
        { key: 'ease_of_use', label: 'Ease of Use (1-5)' },
        { key: 'useful_parts', label: 'Most Useful' },
        { key: 'ease_collecting', label: 'Collecting Payments Easier' },
        { key: 'likes_most', label: 'Likes Most' },
        { key: 'issues', label: 'Issues Faced' },
        { key: 'improvement', label: 'Requested Improvement' },
        { key: 'nps_score', label: 'NPS (0-10)' },
        { key: 'follow_up', label: 'Open to Follow-up' },
        { key: 'contact', label: 'Contact' },
        { key: 'admin_note', label: 'Note' },
      ],
      responses.map(r => ({
        ...r,
        useful_parts: r.useful_parts.join('; '),
        follow_up: r.follow_up ? 'Yes' : 'No',
        campaign_name: r.campaign_name ?? '',
        admin_note: r.admin_note ?? '',
      }))
    )
  }

  if (error && !summary) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
        <p className="font-semibold text-red-700">Could not load feedback</p>
        <p className="mt-1 text-sm text-red-600">{error}</p>
      </div>
    )
  }

  if (!summary) return <p className="text-sm text-gray-400">Loading...</p>

  const cards = [
    { label: 'Total Responses', value: summary.total, color: 'text-blue-700' },
    { label: 'NPS Score', value: `${summary.nps} (${npsLabel(summary.nps)})`, color: 'text-purple-700' },
    { label: 'Promoters', value: summary.promoters, color: 'text-green-700' },
    { label: 'Passives', value: summary.passives, color: 'text-amber-700' },
    { label: 'Detractors', value: summary.detractors, color: 'text-red-700' },
    { label: 'Avg Satisfaction', value: summary.avg_satisfaction + ' / 5', color: 'text-teal-700' },
    { label: 'Avg Ease of Use', value: summary.avg_ease_of_use + ' / 5', color: 'text-cyan-700' },
    { label: 'Follow-up Requests', value: summary.follow_ups, color: 'text-orange-700' },
  ]

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Merchant Feedback</h1>
          <p className="text-sm text-gray-500">
            Answers to the feedback form, and what the team has done with them.
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={responses.length === 0}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-charcoal transition-colors hover:bg-gray-50 disabled:opacity-40"
        >
          Export to Excel
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(c => (
          <div key={c.label} className="rounded-2xl border border-gray-200 bg-white p-6">
            <p className="text-sm font-medium text-gray-500">{c.label}</p>
            <p className={`mt-2 text-3xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-500">Status</span>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-charcoal"
          >
            <option value="">Any</option>
            <option value="new">New</option>
            <option value="reviewed">Reviewed</option>
            <option value="actioned">Actioned</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-500">Campaign</span>
          <select
            value={campaignId}
            onChange={e => setCampaignId(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-charcoal"
          >
            <option value="">Any campaign</option>
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <label className="block flex-1 min-w-[200px]">
          <span className="mb-1 block text-xs font-semibold text-gray-500">Search</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Business, contact, issue..."
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-charcoal"
          />
        </label>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      <div className="mt-6">
        <h2 className="mb-4 text-lg font-bold tracking-tight">Responses ({responses.length})</h2>
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-5 py-3 font-semibold text-gray-500">Business</th>
                <th className="px-5 py-3 font-semibold text-gray-500">Campaign</th>
                <th className="px-5 py-3 font-semibold text-gray-500">Status</th>
                <th className="px-5 py-3 font-semibold text-gray-500">Satis.</th>
                <th className="px-5 py-3 font-semibold text-gray-500">NPS</th>
                <th className="px-5 py-3 font-semibold text-gray-500">Follow-up</th>
                <th className="px-5 py-3 font-semibold text-gray-500">Date</th>
                <th className="px-5 py-3 font-semibold text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {responses.map(r => (
                <Fragment key={r.id}>
                  <tr className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <p className="font-medium">{r.merchant_name}</p>
                      {r.merchant_email && <p className="text-xs text-gray-400">{r.merchant_email}</p>}
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {r.campaign_id ? (
                        <a href={`/admin/messaging/campaigns/${r.campaign_id}`} className="hover:underline">
                          {r.campaign_name || 'Campaign'}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-5 py-3"><FeedbackStatusBadge status={r.status} /></td>
                    <td className="px-5 py-3">{r.satisfaction}/5</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.nps_score >= 9 ? 'bg-green-50 text-green-700' : r.nps_score >= 7 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                        {r.nps_score}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{r.follow_up ? 'Yes' : 'No'}</td>
                    <td className="px-5 py-3 text-gray-400">{new Date(r.created_at).toLocaleDateString('en-IN')}</td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100"
                      >
                        {expanded === r.id ? 'Hide details' : 'View details'}
                      </button>
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr className="border-b border-gray-50 bg-gray-50/50">
                      <td colSpan={8} className="px-5 py-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="text-xs">
                            <p className="font-semibold text-gray-500">Most Useful</p>
                            <p className="mt-1 text-gray-700">{r.useful_parts.length ? r.useful_parts.join(', ') : 'Not answered'}</p>
                          </div>
                          <div className="text-xs">
                            <p className="font-semibold text-gray-500">Contact</p>
                            <p className="mt-1 text-gray-700">{r.contact || 'Not provided'}</p>
                          </div>
                          <div className="text-xs">
                            <p className="font-semibold text-gray-500">What do you like most?</p>
                            <p className="mt-1 text-gray-700">{r.likes_most || 'Not answered'}</p>
                          </div>
                          <div className="text-xs">
                            <p className="font-semibold text-gray-500">Issues or difficulties</p>
                            <p className="mt-1 text-gray-700">{r.issues || 'Not answered'}</p>
                          </div>
                          <div className="text-xs sm:col-span-2">
                            <p className="font-semibold text-gray-500">Requested improvement or feature</p>
                            <p className="mt-1 text-gray-700">{r.improvement || 'Not answered'}</p>
                          </div>

                          <div className="text-xs sm:col-span-2">
                            <p className="mb-1 font-semibold text-gray-500">What are we doing about it?</p>
                            <textarea
                              defaultValue={r.admin_note ?? ''}
                              rows={2}
                              onBlur={e => {
                                const note = e.target.value.trim()
                                if (note !== (r.admin_note ?? '').trim()) update(r.id, { adminNote: note })
                              }}
                              placeholder="Note for the team..."
                              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:border-charcoal"
                            />
                          </div>

                          <div className="flex items-center gap-2 text-xs sm:col-span-2">
                            <span className="font-semibold text-gray-500">Mark as</span>
                            {FEEDBACK_STATUSES.map(s => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => update(r.id, { status: s })}
                                disabled={r.status === s}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                                  r.status === s
                                    ? 'bg-charcoal text-white'
                                    : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                }`}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {responses.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-gray-400">No feedback responses yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <LoadMore cursor={cursor} onLoad={() => load(cursor)} loading={loading} className="mt-4" />
      </div>
    </div>
  )
}
