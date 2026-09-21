'use client'

import { Fragment, useEffect, useState } from 'react'
import { exportToCSV } from '@/lib/export-csv'

interface FeedbackResponse {
  id: string
  merchant_name: string
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
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/feedback').then(r => r.json()).then(d => {
      setSummary(d.summary)
      setResponses(d.responses || [])
    }).catch(() => {})
  }, [])

  function handleExport() {
    exportToCSV('toropay-feedback', [
      { key: 'created_at', label: 'Date' },
      { key: 'merchant_name', label: 'Business Name' },
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
    ], responses.map(r => ({ ...r, useful_parts: r.useful_parts.join('; '), follow_up: r.follow_up ? 'Yes' : 'No' })))
  }

  if (!summary) return <p className="text-sm text-gray-400">Loading...</p>

  const cards = [
    { label: 'Total Responses', value: summary.total, color: 'bg-blue-50 text-blue-700' },
    { label: 'NPS Score', value: `${summary.nps} (${npsLabel(summary.nps)})`, color: 'bg-purple-50 text-purple-700' },
    { label: 'Promoters', value: summary.promoters, color: 'bg-green-50 text-green-700' },
    { label: 'Passives', value: summary.passives, color: 'bg-amber-50 text-amber-700' },
    { label: 'Detractors', value: summary.detractors, color: 'bg-red-50 text-red-700' },
    { label: 'Avg Satisfaction', value: summary.avg_satisfaction + ' / 5', color: 'bg-teal-50 text-teal-700' },
    { label: 'Avg Ease of Use', value: summary.avg_ease_of_use + ' / 5', color: 'bg-cyan-50 text-cyan-700' },
    { label: 'Follow-up Requests', value: summary.follow_ups, color: 'bg-orange-50 text-orange-700' },
  ]

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Merchant Feedback</h1>
        <button onClick={handleExport} disabled={responses.length === 0}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-charcoal transition-colors hover:bg-gray-50 disabled:opacity-40">
          Export to Excel
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(c => (
          <div key={c.label} className="rounded-2xl border border-gray-200 bg-white p-6">
            <p className="text-sm font-medium text-gray-500">{c.label}</p>
            <p className={`mt-2 text-3xl font-bold ${c.color.split(' ')[1]}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-lg font-bold tracking-tight">Responses ({responses.length})</h2>
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-5 py-3 font-semibold text-gray-500">Business</th>
                <th className="px-5 py-3 font-semibold text-gray-500">Satis.</th>
                <th className="px-5 py-3 font-semibold text-gray-500">Ease</th>
                <th className="px-5 py-3 font-semibold text-gray-500">NPS</th>
                <th className="px-5 py-3 font-semibold text-gray-500">Collecting</th>
                <th className="px-5 py-3 font-semibold text-gray-500">Follow-up</th>
                <th className="px-5 py-3 font-semibold text-gray-500">Date</th>
                <th className="px-5 py-3 font-semibold text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {responses.map(r => (
                <Fragment key={r.id}>
                  <tr className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium">{r.merchant_name}</td>
                    <td className="px-5 py-3">{r.satisfaction}/5</td>
                    <td className="px-5 py-3">{r.ease_of_use}/5</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.nps_score >= 9 ? 'bg-green-50 text-green-700' : r.nps_score >= 7 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                        {r.nps_score}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{r.ease_collecting}</td>
                    <td className="px-5 py-3 text-gray-500">{r.follow_up ? 'Yes' : 'No'}</td>
                    <td className="px-5 py-3 text-gray-400">{new Date(r.created_at).toLocaleDateString('en-IN')}</td>
                    <td className="px-5 py-3">
                      <button onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100">
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
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {responses.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-gray-400">No feedback responses yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}