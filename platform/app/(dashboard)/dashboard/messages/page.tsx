'use client'

import { useEffect, useState, useCallback } from 'react'
import { Send, RotateCcw, Plus, Trash2 } from 'lucide-react'

type Tab = 'templates' | 'automations' | 'history' | 'followups' | 'channels'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'templates', label: 'Templates' },
  { key: 'automations', label: 'Automations' },
  { key: 'history', label: 'Message History' },
  { key: 'followups', label: 'Follow-ups' },
  { key: 'channels', label: 'Channels' },
]

const CHANNELS = ['whatsapp', 'instagram', 'email'] as const
type Channel = (typeof CHANNELS)[number]

interface MsgTemplate {
  id: string
  channel: string
  eventType: string | null
  name: string
  subject: string
  body: string
  isActive: boolean
}

interface AutomationRule {
  id: string
  eventType: string
  eventLabel: string
  channel: string
  templateId: string | null
  enabled: boolean
  delayMinutes: number | null
}

interface MsgLog {
  id: string
  channel: string
  eventType: string | null
  recipient: string
  subject: string
  status: string
  attemptCount: number
  failureReason: string | null
  provider: string
  createdAt: string
}

interface FollowUpTask {
  id: string
  customerId: string | null
  category: string
  title: string
  status: string
  dueAt: string | null
  notes: string | null
  customer?: { fullName: string; phone: string; email: string } | null
}

interface FollowUpSuggestion {
  category: string
  title: string
  customerId: string | null
  orderId: string | null
  orderNumber: string | null
  reference: string | null
  detail: string
  dueAt: string
}

interface ChannelStatus {
  channel: string
  connected: boolean
  accountId: string | null
  hasCredentials: boolean
  hasWebhookSecret: boolean
  isEnabled: boolean
  error?: string
}

function jfetch<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  return fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  }).then(async res => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as { error?: string }).error ?? 'Request failed')
    }
    return res.json() as Promise<T>
  })
}

function Badge({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'gray'; children: React.ReactNode }) {
  const tones = {
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-600',
    gray: 'bg-gray-100 text-gray-500',
  }
  return <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${tones[tone]}`}>{children}</span>
}

export default function MessagesPage() {
  const [tab, setTab] = useState<Tab>('templates')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
        <p className="text-sm text-gray-500">WhatsApp &amp; Instagram notifications, automations, and follow-ups.</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${tab === t.key ? 'bg-charcoal text-white' : 'border border-gray-200 bg-white text-gray-500 hover:text-charcoal'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'templates' && <TemplatesPanel />}
      {tab === 'automations' && <AutomationsPanel />}
      {tab === 'history' && <HistoryPanel />}
      {tab === 'followups' && <FollowUpsPanel />}
      {tab === 'channels' && <ChannelsPanel />}
    </div>
  )
}

function TemplatesPanel() {
  const [templates, setTemplates] = useState<MsgTemplate[]>([])
  const [eventTypes, setEventTypes] = useState<Array<{ key: string; label: string }>>([])
  const [channel, setChannel] = useState<Channel>('whatsapp')
  const [eventType, setEventType] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await jfetch<{ templates: MsgTemplate[]; event_types: Array<{ key: string; label: string }> }>('/api/messages/templates')
      setTemplates(res.templates)
      setEventTypes(res.event_types)
    } catch (e) {
      setMessage((e as Error).message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!eventType || !body.trim()) { setMessage('Pick an event and write a body'); return }
    setSaving(true)
    try {
      await jfetch('/api/messages/templates', {
        method: 'POST',
        body: JSON.stringify({ channel, eventType, subject, body, isActive: true }),
      })
      setMessage('Saved')
      await load()
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (t: MsgTemplate) => {
    try {
      await jfetch('/api/messages/templates', {
        method: 'POST',
        body: JSON.stringify({ channel: t.channel, eventType: t.eventType ?? t.name, subject: t.subject, body: t.body, isActive: !t.isActive }),
      })
      await load()
    } catch (e) {
      setMessage((e as Error).message)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
          <h2 className="mb-4 text-sm font-bold text-gray-700">Your Templates</h2>
          {message && <p className="mb-3 text-xs font-medium text-green-600">{message}</p>}
          {templates.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No custom templates yet. Create one on the right.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-100">
                  <tr>
                    <th className="pb-2 font-semibold text-gray-500">Channel</th>
                    <th className="pb-2 font-semibold text-gray-500">Event</th>
                    <th className="pb-2 font-semibold text-gray-500">Subject / Body</th>
                    <th className="pb-2 font-semibold text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map(t => (
                    <tr key={t.id} className="border-b border-gray-50 align-top">
                      <td className="py-3 capitalize text-gray-500">{t.channel}</td>
                      <td className="py-3 font-medium text-gray-700">{t.eventType ?? t.name}</td>
                      <td className="py-3">
                        {t.subject && <p className="text-xs font-medium text-gray-500">{t.subject}</p>}
                        <p className="max-w-md truncate text-xs text-gray-400">{t.body}</p>
                      </td>
                      <td className="py-3">
                        <button onClick={() => toggleActive(t)} title="Toggle">
                          {t.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Disabled</Badge>}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-2 space-y-4">
        <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
          <h2 className="mb-4 text-sm font-bold text-gray-700">New / Edit Template</h2>
          <div className="space-y-3">
            <div className="flex gap-2">
              {CHANNELS.map(c => (
                <button key={c} onClick={() => setChannel(c)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${channel === c ? 'bg-charcoal text-white' : 'border border-gray-200 text-gray-500 hover:text-charcoal'}`}>
                  {c}
                </button>
              ))}
            </div>
            <select value={eventType} onChange={e => setEventType(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-charcoal">
              <option value="">Select event…</option>
              {eventTypes.map(ev => <option key={ev.key} value={ev.key}>{ev.label}</option>)}
            </select>
            {channel === 'email' && (
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject line"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-charcoal" />
            )}
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={7} placeholder="Message body — use {{customer_name}}, {{order_number}} etc."
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-mono outline-none focus:border-charcoal" />
            <button onClick={save} disabled={saving}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-charcoal px-5 py-2.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {saving ? 'Saving…' : <><Send className="h-3.5 w-3.5" /> Save Template</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AutomationsPanel() {
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await jfetch<{ rules: AutomationRule[] }>('/api/messages/automations')
      setRules(res.rules)
    } catch (e) {
      setMessage((e as Error).message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = async (rule: AutomationRule) => {
    try {
      await jfetch('/api/messages/automations', {
        method: 'POST',
        body: JSON.stringify({ eventType: rule.eventType, channel: rule.channel, enabled: !rule.enabled }),
      })
      await load()
    } catch (e) {
      setMessage((e as Error).message)
    }
  }

  const scheduled = rules.filter(r => r.enabled)
  const manual = rules.filter(r => !r.enabled)

  return (
    <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
      <h2 className="mb-1 text-sm font-bold text-gray-700">Automation Rules</h2>
      <p className="mb-4 text-xs text-gray-400">Rules are off by default — flip them on to start sending automatically on each event.</p>
      {message && <p className="mb-3 text-xs font-medium text-green-600">{message}</p>}

      <Section label="Enabled">
        {scheduled.length === 0 && <p className="py-3 text-xs text-gray-400">Nothing enabled yet.</p>}
        <RuleRows rules={scheduled} onToggle={toggle} />
      </Section>
      <Section label="Disabled">
        {manual.length === 0 && <p className="py-3 text-xs text-gray-400">All rules enabled.</p>}
        <RuleRows rules={manual} onToggle={toggle} />
      </Section>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
      {children}
    </div>
  )
}

function RuleRows({ rules, onToggle }: { rules: AutomationRule[]; onToggle: (r: AutomationRule) => void }) {
  return (
    <div className="space-y-2">
      {rules.map(rule => (
        <div key={rule.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-2.5">
          <div>
            <p className="text-sm font-medium text-gray-700">{rule.eventLabel}</p>
            <p className="text-xs capitalize text-gray-400">{rule.channel}{rule.delayMinutes ? ` · ${rule.delayMinutes}min delay` : ''}</p>
          </div>
          <button onClick={() => onToggle(rule)}
            className={`relative h-5 w-9 rounded-full transition-colors ${rule.enabled ? 'bg-green-500' : 'bg-gray-200'}`} aria-label="Toggle rule">
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${rule.enabled ? 'left-4.5 left-[18px]' : 'left-0.5'}`} />
          </button>
        </div>
      ))}
    </div>
  )
}

function HistoryPanel() {
  const [logs, setLogs] = useState<MsgLog[]>([])
  const [status, setStatus] = useState('')
  const [channel, setChannel] = useState('')
  const [total, setTotal] = useState(0)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      const sp = new URLSearchParams()
      if (status) sp.set('status', status)
      if (channel) sp.set('channel', channel)
      const res = await jfetch<{ logs: MsgLog[]; total: number }>(`/api/messages/history?${sp.toString()}`)
      setLogs(res.logs)
      setTotal(res.total)
    } catch (e) {
      setMessage((e as Error).message)
    }
  }, [status, channel])

  useEffect(() => { load() }, [load])

  const retry = async (id: string) => {
    try {
      await jfetch(`/api/messages/history/${id}/retry`, { method: 'POST' })
      await load()
    } catch (e) {
      setMessage((e as Error).message)
    }
  }

  return (
    <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-gray-700">Message History ({total})</h2>
        <div className="flex gap-2">
          <select value={channel} onChange={e => setChannel(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs">
            <option value="">All channels</option>
            {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs">
            <option value="">All statuses</option>
            {['queued', 'sent', 'delivered', 'read', 'failed'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      {message && <p className="mb-3 text-xs font-medium text-green-600">{message}</p>}
      {logs.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">No messages yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100">
              <tr>
                <th className="pb-2 font-semibold text-gray-500">Channel</th>
                <th className="pb-2 font-semibold text-gray-500">Event</th>
                <th className="pb-2 font-semibold text-gray-500">Recipient</th>
                <th className="pb-2 font-semibold text-gray-500">Status</th>
                <th className="pb-2 font-semibold text-gray-500">When</th>
                <th className="pb-2 font-semibold text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-b border-gray-50">
                  <td className="py-2.5 capitalize text-gray-500">{l.channel}</td>
                  <td className="py-2.5 text-gray-700">{l.eventType ?? '—'}</td>
                  <td className="py-2.5 text-gray-500">{l.recipient || '—'}</td>
                  <td className="py-2.5">
                    {l.status === 'delivered' && <Badge tone="green">Delivered</Badge>}
                    {l.status === 'read' && <Badge tone="green">Read</Badge>}
                    {l.status === 'sent' && <Badge tone="amber">Sent</Badge>}
                    {l.status === 'queued' && <Badge tone="gray">Queued</Badge>}
                    {l.status === 'failed' && <Badge tone="red">Failed</Badge>}
                  </td>
                  <td className="py-2.5 text-xs text-gray-400">{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="py-2.5">
                    {l.status === 'failed' && (
                      <button onClick={() => retry(l.id)} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:text-charcoal">
                        <RotateCcw className="h-3 w-3" /> Retry
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const KIND_LABELS: Record<string, string> = {
  payment_pending: 'Payment pending',
  delivery_failed: 'Delivery issue',
  review_request: 'Review request',
  repeat_customer: 'Repeat customer',
  return_response: 'Return follow-up',
}

function FollowUpsPanel() {
  const [tasks, setTasks] = useState<FollowUpTask[]>([])
  const [suggestions, setSuggestions] = useState<FollowUpSuggestion[]>([])
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await jfetch<{ tasks: FollowUpTask[]; suggestions: FollowUpSuggestion[] }>('/api/messages/follow-ups')
      setTasks(res.tasks)
      setSuggestions(res.suggestions)
    } catch (e) {
      setMessage((e as Error).message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addSuggestion = async (s: FollowUpSuggestion) => {
    try {
      await jfetch('/api/messages/follow-ups', {
        method: 'POST',
        body: JSON.stringify({ fromSuggestion: true, suggestion: s }),
      })
      await load()
    } catch (e) {
      setMessage((e as Error).message)
    }
  }

  const complete = async (id: string) => {
    try {
      await jfetch(`/api/messages/follow-ups/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) })
      await load()
    } catch (e) {
      setMessage((e as Error).message)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
        <h2 className="mb-4 text-sm font-bold text-gray-700">Suggested Follow-ups</h2>
        {message && <p className="mb-3 text-xs font-medium text-green-600">{message}</p>}
        {suggestions.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Nothing needs attention right now.</p>
        ) : (
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <div key={`${s.customerId}-${s.category}-${i}`} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-700">{s.title}</p>
                  <p className="text-xs text-gray-400">{KIND_LABELS[s.category] ?? s.category} — {s.detail}</p>
                </div>
                <button onClick={() => addSuggestion(s)} className="ml-3 flex shrink-0 items-center gap-1 rounded-lg bg-charcoal px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90">
                  <Plus className="h-3 w-3" /> Add
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
        <h2 className="mb-4 text-sm font-bold text-gray-700">Open Tasks</h2>
        {tasks.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No tasks yet.</p>
        ) : (
          <div className="space-y-2">
            {tasks.map(t => (
              <div key={t.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-700">{t.customer?.fullName ?? t.title}</p>
                  <p className="text-xs text-gray-400">{KIND_LABELS[t.category] ?? t.category}{t.dueAt ? ` · due ${new Date(t.dueAt).toLocaleDateString()}` : ''}</p>
                  {t.notes && <p className="truncate text-xs text-gray-300">{t.notes}</p>}
                </div>
                <button onClick={() => complete(t.id)} className="ml-3 flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:text-charcoal">
                  Complete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ChannelsPanel() {
  const [channels, setChannels] = useState<ChannelStatus[]>([])
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await jfetch<{ channels: ChannelStatus[] }>('/api/messages/settings')
      setChannels(res.channels)
    } catch (e) {
      setMessage((e as Error).message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const connect = async (channel: string) => {
    try {
      await jfetch('/api/messages/settings', {
        method: 'POST',
        body: JSON.stringify({ action: 'connect', channel, credentials: { token: tokens[channel] || '' } }),
      })
      setMessage(`${channel} connected`)
      await load()
    } catch (e) {
      setMessage((e as Error).message)
    }
  }

  const disconnect = async (channel: string) => {
    try {
      await jfetch('/api/messages/settings', { method: 'POST', body: JSON.stringify({ action: 'disconnect', channel }) })
      await load()
    } catch (e) {
      setMessage((e as Error).message)
    }
  }

  const testSend = async (channel: string, to: string) => {
    setSending(true)
    try {
      await jfetch('/api/messages/settings', {
        method: 'POST',
        body: JSON.stringify({ action: 'test', channel, to }),
      })
      setMessage('Test message sent')
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
      <h2 className="mb-1 text-sm font-bold text-gray-700">Channel Connections</h2>
      <p className="mb-4 text-xs text-gray-400">Connected channels use their real providers; unconnected ones fall back to a sandbox mock.</p>
      {message && <p className="mb-3 text-xs font-medium text-green-600">{message}</p>}

      <div className="space-y-3">
        {channels.map(c => (
          <div key={c.channel} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-semibold capitalize text-gray-700">{c.channel}</p>
              <p className="text-xs text-gray-400">
                {c.channel === 'email'
                  ? 'Built-in email provider (Resend in production, mock in sandbox).'
                  : c.connected
                    ? `Connected${c.accountId ? ` · ${c.accountId}` : ''}`
                    : 'Not connected — sandbox messaging active.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {c.channel !== 'email' && (
                <>
                  <input value={tokens[c.channel] || ''} onChange={e => setTokens({ ...tokens, [c.channel]: e.target.value })}
                    placeholder={c.channel === 'whatsapp' ? 'Meta access token' : 'Instagram access token'}
                    className="w-56 rounded-xl border border-gray-200 px-3 py-1.5 text-xs outline-none focus:border-charcoal" />
                  {c.connected
                    ? <button onClick={() => disconnect(c.channel)} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50"><Trash2 className="h-3 w-3 inline" /> Disconnect</button>
                    : <button onClick={() => connect(c.channel)} className="rounded-lg bg-charcoal px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90">Connect</button>}
                </>
              )}
              <button onClick={() => testSend(c.channel, c.channel === 'email' ? 'merchant@example.com' : '915000000000')} disabled={sending}
                className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:text-charcoal disabled:opacity-50">
                Send test
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}