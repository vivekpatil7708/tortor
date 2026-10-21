'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AudienceBuilder } from '@/components/admin/audience-builder'
import { useDebounced } from '@/components/admin/load-more'
import { BROADCAST_VARIABLES, DEFAULT_BROADCAST_TEMPLATE, unsupportedVariables } from '@/lib/messaging'
import type { Audience } from '@/lib/broadcast-audience'

interface PreviewSample {
  email: string
  business_name: string
  subject: string
  body: string
}

interface Preview {
  total: number
  matched: number
  suppressed: number
  too_many: boolean
  unsupported_variables: string[]
  sample: PreviewSample[]
}

export default function AdminMessagingCompose() {
  const [name, setName] = useState('')
  const [subject, setSubject] = useState(DEFAULT_BROADCAST_TEMPLATE.subject)
  const [body, setBody] = useState(DEFAULT_BROADCAST_TEMPLATE.body)
  const [ctaLabel, setCtaLabel] = useState('')
  const [audience, setAudience] = useState<Audience>({ status: 'active' })

  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ campaign_id: string; total: number; sent: number; failed: number; remaining: number } | null>(null)

  // A template can be picked from the template library.
  useEffect(() => {
    const templateId = new URLSearchParams(window.location.search).get('template')
    if (!templateId) return
    fetch(`/api/admin/templates/${templateId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data?.template) return
        setSubject(data.template.subject || '')
        setBody(data.template.body)
        setName(data.template.name)
      })
      .catch(() => {})
  }, [])

  // The variables a broadcast cannot fill in. Sending with any of them would
  // send the placeholder itself to every recipient.
  const unsupported = useMemo(
    () => unsupportedVariables(`${subject}\n${body}`, BROADCAST_VARIABLES),
    [subject, body]
  )

  const previewRequest = useDebounced({ subject, body, ctaLabel: ctaLabel || undefined, audience }, 700)

  useEffect(() => {
    let cancelled = false
    setPreviewing(true)
    fetch('/api/admin/campaigns/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(previewRequest),
    })
      .then(async r => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Could not build the preview')
        return data
      })
      .then(data => {
        if (cancelled) return
        setPreview(data)
        setPreviewError(null)
      })
      .catch(e => {
        if (cancelled) return
        setPreviewError(e instanceof Error ? e.message : 'Could not build the preview')
      })
      .finally(() => {
        if (!cancelled) setPreviewing(false)
      })
    return () => {
      cancelled = true
    }
  }, [previewRequest])

  const canSend = Boolean(subject.trim() && body.trim()) && unsupported.length === 0 && !sending && !saving

  async function saveCampaign(): Promise<string> {
    const res = await fetch('/api/admin/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim() || subject.trim(),
        subject,
        body,
        ctaLabel: ctaLabel.trim() || undefined,
        audience,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Could not save the campaign')
    return data.campaign.id as string
  }

  async function handleSaveDraft() {
    setSaving(true)
    setError(null)
    try {
      const id = await saveCampaign()
      window.location.href = `/admin/messaging/campaigns/${id}`
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the campaign')
    } finally {
      setSaving(false)
    }
  }

  async function handleSend() {
    setSending(true)
    setError(null)
    try {
      const id = await saveCampaign()
      const res = await fetch(`/api/admin/campaigns/${id}/send`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not send the campaign')
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the campaign')
    } finally {
      setSending(false)
    }
  }

  const recipients = preview ? preview.total : 0

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">New broadcast</h1>
        <p className="text-sm text-gray-500">
          Write one message and send it to the merchants you choose.
        </p>
      </div>

      {result && (
        <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-5">
          <p className="font-semibold text-green-800">Campaign sent</p>
          <p className="mt-1 text-sm text-green-700">
            {result.sent} of {result.total} merchants emailed
            {result.failed > 0 ? `, ${result.failed} failed` : ''}
            {result.remaining > 0 ? `, ${result.remaining} still waiting to go out` : ''}.
          </p>
          <Link
            href={`/admin/messaging/campaigns/${result.campaign_id}`}
            className="mt-2 inline-block text-xs font-semibold text-green-800 underline hover:no-underline"
          >
            Open the campaign
          </Link>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500" htmlFor="campaign-name">
              Campaign name
            </label>
            <input
              id="campaign-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. October product update"
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-charcoal"
            />
            <p className="mt-1 text-[11px] text-gray-400">Only you see this. Recipients see the subject line.</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500" htmlFor="campaign-subject">
              Subject line
            </label>
            <input
              id="campaign-subject"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-charcoal"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500" htmlFor="campaign-body">
              Message body
            </label>
            <textarea
              id="campaign-body"
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={12}
              className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-mono outline-none focus:border-charcoal"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500" htmlFor="campaign-cta">
              Button label
            </label>
            <input
              id="campaign-cta"
              value={ctaLabel}
              onChange={e => setCtaLabel(e.target.value)}
              placeholder="Share Your Feedback"
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-charcoal"
            />
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <p className="mb-2 text-xs font-semibold text-gray-400">Variables you can use</p>
            <div className="flex flex-wrap gap-1">
              {BROADCAST_VARIABLES.map(v => (
                <code key={v} className="rounded-md bg-white px-1.5 py-0.5 text-xs text-gray-500">{`{{${v}}}`}</code>
              ))}
            </div>
            {unsupported.length > 0 && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] font-medium text-red-600">
                These are not available in a broadcast, so they would be sent as they are:{' '}
                {unsupported.map(v => `{{${v}}}`).join(', ')}
              </p>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-gray-500">Who receives it</p>
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <AudienceBuilder value={audience} onChange={setAudience} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className="flex items-center gap-1.5 rounded-xl bg-[#7bb86c] px-5 py-2.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {sending ? 'Sending...' : `Send to ${recipients} merchant${recipients === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving || sending || unsupported.length > 0}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save as draft'}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white/60 p-5 backdrop-blur-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-400">PREVIEW</p>
              {previewing && <p className="text-[11px] text-gray-400">Updating...</p>}
            </div>

            {previewError && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{previewError}</p>
            )}

            {preview && !previewError && (
              <>
                <p className="mb-3 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  Goes to <strong>{preview.total}</strong> merchant{preview.total === 1 ? '' : 's'}.
                  {preview.suppressed > 0 && (
                    <> {preview.suppressed} address{preview.suppressed === 1 ? ' is' : 'es are'} on the suppression list and will not be emailed.</>
                  )}
                  {preview.too_many && (
                    <> This audience is too large to send to in one go. Narrow it down first.</>
                  )}
                </p>

                {preview.sample.length === 0 ? (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    No merchant matches this audience yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {preview.sample.map(sample => (
                      <div key={sample.email} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                        <p className="mb-1 text-[11px] font-medium text-gray-400">To {sample.business_name} ({sample.email})</p>
                        <p className="mb-2 text-xs font-semibold text-gray-700">{sample.subject}</p>
                        <p className="whitespace-pre-wrap text-sm text-gray-600">{sample.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
