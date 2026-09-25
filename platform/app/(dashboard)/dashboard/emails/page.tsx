'use client'

import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EmailSetting {
  key: string
  subject: string
  body: string
  is_active: boolean
  is_default: boolean
  default_subject: string
  default_body: string
}

interface EmailLog {
  id: string
  template_key: string
  recipient: string
  subject: string
  status: string
  provider: string
  error_message: string | null
  created_at: string
}

export default function EmailsPage() {
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [settings, setSettings] = useState<EmailSetting[]>([])
  const [logs, setLogs] = useState<EmailLog[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const [editing, setEditing] = useState<EmailSetting | null>(null)
  const [draft, setDraft] = useState({ subject: '', body: '' })
  const [testTo, setTestTo] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    refresh()
  }, [])

  async function refresh() {
    const [settingsRes, logsRes] = await Promise.all([
      fetch('/api/emails/settings').then(r => (r.ok ? r.json() : { settings: [], labels: {} })),
      fetch('/api/emails/logs').then(r => (r.ok ? r.json() : [])),
    ])
    setSettings(settingsRes.settings)
    setLabels(settingsRes.labels)
    setLogs(logsRes)
    setLoading(false)
  }

  function openEditor(setting: EmailSetting) {
    setEditing(setting)
    setDraft({ subject: setting.subject, body: setting.body })
  }

  async function saveDraft(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setSaving(true)
    const res = await fetch('/api/emails/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: editing.key, subject: draft.subject, body: draft.body }),
    })
    setSaving(false)
    if (!res.ok) {
      setMsg('Failed to save')
      return
    }
    setMsg('Saved')
    setEditing(null)
    setTimeout(() => setMsg(''), 2500)
    refresh()
  }

  async function toggleActive(setting: EmailSetting) {
    await fetch('/api/emails/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: setting.key, is_active: !setting.is_active }),
    })
    refresh()
  }

  async function sendTest(setting: EmailSetting) {
    if (!testTo) {
      setMsg('Enter a recipient email before testing')
      setTimeout(() => setMsg(''), 2500)
      return
    }
    const res = await fetch('/api/emails/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: setting.key, to: testTo }),
    })
    const data = (await res.json()) as { status?: string }
    setMsg(data.status === 'sent' ? `Test email sent to ${testTo}` : 'Test email failed to send')
    setTimeout(() => setMsg(''), 3000)
  }

  if (editing) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Edit {labels[editing.key] || editing.key}</h1>
            <p className="text-sm text-gray-500">Tips: use {`{{customer_name}} {{business_name}} {{order_number}} {{amount}} {{currency}} {{product_list}} {{tracking_number}} {{awb_number}} {{courier_name}} {{tracking_url}} {{estimated_delivery}} {{event_location}} {{return_tracking_number}} {{support_email}} {{support_phone}}`}</p>
          </div>
          <Button variant="secondary" onClick={() => setEditing(null)}>Back</Button>
        </div>

        {msg && <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-600">{msg}</div>}

        <form onSubmit={saveDraft} className="space-y-4 rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Subject</span>
            <input value={draft.subject} onChange={e => setDraft({ ...draft, subject: e.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Body</span>
            <textarea value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} rows={14}
              className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 font-mono text-xs leading-relaxed outline-none" />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save template'}</Button>
            {editing.is_default === false && (
              <Button type="button" variant="secondary" onClick={() => { setDraft({ subject: editing.default_subject, body: editing.default_body }) }}>
                Reset to default
              </Button>
            )}
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Emails</h1>
        <p className="text-sm text-gray-500">Customer + merchant emails sent automatically after payments and at shipment milestones (created, picked up, in transit, out for delivery, delivered, failed, RTO).</p>
      </div>

      {msg && <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-600">{msg}</div>}

      <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">Test send address</h2>
            <p className="text-xs text-gray-500">Receive sample emails for any template (current provider: mock unless RESEND_API_KEY is set).</p>
          </div>
          <input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="you@example.com"
            className="w-56 rounded-xl border border-gray-200 bg-white/70 px-4 py-2 text-sm outline-none" />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="space-y-3">
          {settings.map(setting => (
            <div key={setting.key} className="rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold">{labels[setting.key] || setting.key}</p>
                    {setting.is_default && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500">Default</span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-gray-500">{setting.subject}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-500">
                    <input type="checkbox" checked={setting.is_active} onChange={() => toggleActive(setting)} className="h-3.5 w-3.5 rounded" />
                    On
                  </label>
                  <Button size="sm" variant="secondary" onClick={() => sendTest(setting)}>
                    <Send className="mr-1 h-3 w-3" /> Test
                  </Button>
                  <Button size="sm" onClick={() => openEditor(setting)}>Edit</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-400">Send logs</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-gray-400">No emails sent yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/60 backdrop-blur-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wider text-gray-400">
                  <th className="px-4 py-3">Template</th>
                  <th className="px-4 py-3">Recipient</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">When</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5 text-xs">{labels[log.template_key] || log.template_key}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{log.recipient}</td>
                    <td className="max-w-[220px] truncate px-4 py-2.5 text-xs text-gray-600">{log.subject}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${log.status === 'sent' ? 'bg-green-100 text-green-700' : log.status === 'queued' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-gray-400">{new Date(log.created_at).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}