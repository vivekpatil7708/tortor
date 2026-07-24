'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { DEFAULT_TEMPLATES, SAMPLE_DATA, renderTemplate, SUPPORTED_VARIABLES, type SampleData } from '@/lib/messaging'
import { Check, RotateCcw, Eye, EyeOff } from 'lucide-react'

interface Template {
  id: string
  merchant_id: string
  channel: string
  name: string
  subject: string
  body: string
  is_default: boolean
}

const CHANNELS = [
  { key: 'email', label: 'Email', icon: '✉️' },
  { key: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { key: 'instagram', label: 'Instagram', icon: '📸' },
]

function statusBadge(status: string | undefined) {
  if (status === 'available') return <span className="ml-1.5 rounded-md bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">Live</span>
  if (status === 'coming_soon') return <span className="ml-1.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Coming soon</span>
  return null
}

export default function MessagingTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [activeChannel, setActiveChannel] = useState('email')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [channelStatus, setChannelStatus] = useState<Record<string, any> | null>(null)

  useEffect(() => {
    api.getMessagingTemplates().then(r => setTemplates(r.templates as unknown as Template[])).catch(() => {})
    api.getChannelStatus().then(r => setChannelStatus(r.channels as unknown as Record<string, any>)).catch(() => {})
  }, [])

  useEffect(() => {
    const tpl = templates.find(t => t.channel === activeChannel)
    if (tpl) {
      setSubject(tpl.subject)
      setBody(tpl.body)
    } else {
      setSubject(DEFAULT_TEMPLATES[activeChannel]?.subject || '')
      setBody(DEFAULT_TEMPLATES[activeChannel]?.body || '')
    }
  }, [activeChannel, templates])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.saveMessagingTemplate({ channel: activeChannel, subject, body })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      const r = await api.getMessagingTemplates()
      setTemplates(r.templates as unknown as Template[])
    } catch {
      alert('Failed to save template.')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    try {
      await api.saveMessagingTemplate({ channel: activeChannel, reset: true })
      const defaults = DEFAULT_TEMPLATES[activeChannel]
      if (defaults) {
        setSubject(defaults.subject)
        setBody(defaults.body)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      const r = await api.getMessagingTemplates()
      setTemplates(r.templates as unknown as Template[])
    } catch {
      alert('Failed to reset template.')
    }
  }

  const renderedSubject = renderTemplate(subject, SAMPLE_DATA as unknown as Record<string, string>)
  const renderedBody = renderTemplate(body, SAMPLE_DATA as unknown as Record<string, string>)
  const status = channelStatus?.[activeChannel]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Messaging Templates</h1>
        <p className="text-sm text-gray-500">Manage confirmation message templates for each channel.</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {CHANNELS.map(ch => (
          <button key={ch.key} onClick={() => setActiveChannel(ch.key)}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${activeChannel === ch.key ? 'bg-charcoal text-white' : 'border border-gray-200 bg-white text-gray-500 hover:text-charcoal'}`}>
            {ch.icon} {ch.label} {statusBadge(channelStatus?.[ch.key]?.status)}
          </button>
        ))}
      </div>

      {status && (
        <div className={`mb-6 rounded-xl border p-3 text-xs ${
          status.status === 'available' ? 'border-green-200 bg-green-50 text-green-700' :
          status.status === 'coming_soon' ? 'border-amber-200 bg-amber-50 text-amber-700' :
          'border-gray-200 bg-gray-50 text-gray-500'
        }`}>
          <span className="font-semibold">{status.provider}:</span> {status.description}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          {activeChannel === 'email' && (
            <div>
              <p className="mb-1 text-xs font-semibold text-gray-500">Subject Line</p>
              <input value={subject} onChange={e => setSubject(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-charcoal" />
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-semibold text-gray-500">Message Body</p>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={10}
              className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-mono outline-none focus:border-charcoal" />
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 rounded-xl bg-charcoal px-5 py-2.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : saving ? 'Saving...' : 'Save Template'}
            </button>
            <button onClick={handleReset} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2.5 text-xs font-semibold text-gray-500 hover:text-charcoal">
              <RotateCcw className="h-3.5 w-3.5" /> Reset to Default
            </button>
            <button onClick={() => setShowPreview(!showPreview)} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2.5 text-xs font-semibold text-gray-500 hover:text-charcoal">
              {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showPreview ? 'Hide Preview' : 'Preview'}
            </button>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <p className="mb-2 text-xs font-semibold text-gray-400">Available Variables</p>
            <div className="flex flex-wrap gap-1">
              {SUPPORTED_VARIABLES.map(v => (
                <code key={v} className="rounded-md bg-white px-1.5 py-0.5 text-xs text-gray-500">{`{{${v}}}`}</code>
              ))}
            </div>
          </div>
        </div>

        {showPreview && (
          <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
            <p className="mb-3 text-xs font-semibold text-gray-400">LIVE PREVIEW</p>
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              {renderedSubject && <p className="mb-2 text-xs font-medium text-gray-600">Subject: {renderedSubject}</p>}
              <p className="whitespace-pre-wrap text-sm text-gray-700">{renderedBody}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
