'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { LoadMore } from '@/components/admin/load-more'
import { BROADCAST_VARIABLES, unsupportedVariables } from '@/lib/messaging'

interface Template {
  id: string
  name: string
  channel: string
  subject: string
  body: string
  language_code: string
  event_type: string | null
  is_active: boolean
  updated_at: string
}

const BLANK = { name: '', channel: 'email', subject: '', body: '', languageCode: 'en', eventType: '' }

export default function AdminTemplates() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Template | null>(null)
  const [form, setForm] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (nextCursor?: string | null) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '25' })
      if (nextCursor) params.set('cursor', nextCursor)
      const res = await fetch(`/api/admin/templates?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load templates')
      setTemplates(prev => (nextCursor ? [...prev, ...(data.templates ?? [])] : (data.templates ?? [])))
      setCursor(data.next_cursor ?? null)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load templates')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function startNew() {
    setEditing(null)
    setForm({ ...BLANK })
  }

  function startEdit(template: Template) {
    setEditing(template)
    setForm({
      name: template.name,
      channel: template.channel,
      subject: template.subject,
      body: template.body,
      languageCode: template.language_code,
      eventType: template.event_type ?? '',
    })
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(editing ? `/api/admin/templates/${editing.id}` : '/api/admin/templates', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          channel: form.channel,
          subject: form.subject,
          body: form.body,
          languageCode: form.languageCode,
          eventType: form.eventType.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save the template')
      startNew()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the template')
    } finally {
      setSaving(false)
    }
  }

  async function remove(template: Template) {
    if (!window.confirm(`Delete the template "${template.name}"?`)) return
    setError(null)
    try {
      const res = await fetch(`/api/admin/templates/${template.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not delete the template')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the template')
    }
  }

  const unsupported = unsupportedVariables(`${form.subject}\n${form.body}`, BROADCAST_VARIABLES)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
          <p className="text-sm text-gray-500">
            Messages you can pick from when you write a broadcast.
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          className="rounded-xl bg-charcoal px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
        >
          New template
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-2.5 font-semibold text-gray-500">Name</th>
                <th className="px-4 py-2.5 font-semibold text-gray-500">Subject</th>
                <th className="px-4 py-2.5 font-semibold text-gray-500">Updated</th>
                <th className="px-4 py-2.5 font-semibold text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {templates.map(t => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium">{t.name}</td>
                  <td className="px-4 py-2.5 text-gray-500">{t.subject || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-400">{new Date(t.updated_at).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/admin/messaging?template=${t.id}`}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Use
                      </Link>
                      <button
                        type="button"
                        onClick={() => startEdit(t)}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(t)}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {templates.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">No templates yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <p className="mb-4 text-sm font-bold">{editing ? 'Edit template' : 'New template'}</p>

          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">Name</span>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-charcoal"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">Channel</span>
              <select
                value={form.channel}
                onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-charcoal"
              >
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="instagram">Instagram</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">Subject</span>
              <input
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-charcoal"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">Body</span>
              <textarea
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                rows={8}
                className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm font-mono outline-none focus:border-charcoal"
              />
            </label>
          </div>

          {unsupported.length > 0 && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[11px] font-medium text-red-600">
              A broadcast cannot fill these in: {unsupported.map(v => `{{${v}}}`).join(', ')}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving || !form.name.trim() || !form.body.trim() || unsupported.length > 0}
              className="rounded-xl bg-charcoal px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving...' : editing ? 'Save changes' : 'Create template'}
            </button>
            {editing && (
              <button
                type="button"
                onClick={startNew}
                className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            )}
          </div>

          <p className="mt-4 text-[11px] text-gray-400">
            Variables you can use: {BROADCAST_VARIABLES.map(v => `{{${v}}}`).join(', ')}
          </p>
        </div>
      </div>

      <LoadMore cursor={cursor} onLoad={() => load(cursor)} loading={loading} className="mt-4" />
    </div>
  )
}
