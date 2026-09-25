'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { formatDateTime, humanize } from '@/lib/ui-format'
import { Trash2, Plug, RefreshCw, Copy, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type SupportedCourier = {
  id: string
  name: string
  description: string
  credential_fields: Array<{ key: string; label: string; type: string; required: boolean; placeholder?: string }>
  webhook_url: string
  supports_label: boolean
  supports_pickup: boolean
  supports_rto: boolean
}

type Connection = {
  id: string
  provider: string
  label: string | null
  status: string
  test_mode: boolean
  has_credentials: boolean
  last_tested_at: string | null
  last_error: string | null
  webhook_secret?: string | null
}

export default function CourierIntegrationsPage() {
  const [supported, setSupported] = useState<SupportedCourier[]>([])
  const [connections, setConnections] = useState<Record<string, Connection>>({})
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState('')
  const [syncing, setSyncing] = useState(false)

  const refresh = useCallback(async () => {
    const res = await api.getCourierConnections()
    setSupported(res.supported_couriers as unknown as SupportedCourier[])
    const conns: Record<string, Connection> = {}
    for (const c of res.connections as unknown as Connection[]) {
      conns[c.provider] = c
    }
    // Pull per-provider webhook secrets for connected providers.
    const withSecrets = await Promise.all(
      (Object.values(conns) as Connection[]).map(async c => {
        try {
          const detail = await api.getCourierConnection(c.provider)
          return { provider: c.provider, connection: detail.connection as unknown as Connection }
        } catch {
          return null
        }
      })
    )
    for (const entry of withSecrets) {
      if (entry) conns[entry.provider] = entry.connection
    }
    setConnections(conns)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 3000) }

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(''), 1500)
    } catch { /* clipboard unavailable */ }
  }

  async function runSync() {
    setSyncing(true)
    try {
      const res = await api.runCourierSync({ limit: 50 })
      flash(`Synced ${res.synced} of ${res.scanned} packages (${res.errors} errors)`)
    } catch (e) {
      flash((e as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Courier integrations</h1>
          <p className="text-sm text-gray-500">
            Connect a courier to create shipments, generate labels and auto-sync tracking. Shipments fall back to the built-in test courier until you connect one.
          </p>
        </div>
        <Button variant="secondary" onClick={runSync} disabled={syncing}>
          {syncing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
          Run courier sync
        </Button>
      </div>

      {msg && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">{msg}</div>}

      {loading ? (
        <p className="text-sm text-gray-400">Loading integrations…</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {supported.map(info => (
            <CourierCard
              key={info.id}
              info={info}
              connection={connections[info.id]}
              onChanged={refresh}
              onFlash={flash}
              copied={copied}
              onCopy={copy}
            />
          ))}

          <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-sm text-gray-500">
            <p className="font-semibold text-gray-700">How the fallback works</p>
            <p className="mt-2">
              Until a courier is connected and marked active, new shipments use the <span className="font-medium">Mock Courier</span> —
              it creates realistic shipments, labels and tracking events locally so the whole flow can be tested end-to-end.
            </p>
            <p className="mt-2">Courier tracking webhooks: <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">POST /api/webhooks/shipping/[provider]</code></p>
          </div>
        </div>
      )}
    </div>
  )
}

function CourierCard({ info, connection, onChanged, onFlash, copied, onCopy }: {
  info: SupportedCourier
  connection?: Connection
  onChanged: () => void
  onFlash: (t: string) => void
  copied: string
  onCopy: (text: string, key: string) => void
}) {
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [reveal, setReveal] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const connected = connection?.status === 'connected'
  const inError = connection?.status === 'error'

  async function save() {
    setSaving(true)
    try {
      const missing = info.credential_fields.filter(f => f.required && !credentials[f.key])
      if (missing.length) { onFlash(`Please fill ${missing[0].label}`); setSaving(false); return }
      await api.saveCourierConnection({
        provider: info.id,
        test_mode: info.id === 'mock',
        credentials,
        active: true,
      })
      onFlash(`${info.name} connected`)
      onChanged()
    } catch (e) {
      onFlash((e as Error).message.replace(/^Error:\s*/, ''))
    } finally {
      setSaving(false)
    }
  }

  async function test() {
    setTesting(true)
    try {
      const res = await api.testCourierConnection(info.id)
      onFlash(res.ok ? `${info.name}: credentials verified` : `${info.name}: ${res.error ?? 'test failed'}`)
      onChanged()
    } catch (e) {
      onFlash((e as Error).message.replace(/^Error:\s*/, ''))
    } finally {
      setTesting(false)
    }
  }

  async function toggleActive() {
    try {
      await api.setCourierConnectionActive(info.id, !connected)
      onChanged()
    } catch (e) {
      onFlash((e as Error).message.replace(/^Error:\s*/, ''))
    }
  }

  async function remove() {
    try {
      await api.deleteCourierConnection(info.id)
      setConfirmDelete(false)
      onFlash(`${info.name} disconnected`)
      onChanged()
    } catch (e) {
      onFlash((e as Error).message.replace(/^Error:\s*/, ''))
    }
  }

  const webhook = `${typeof window !== 'undefined' ? window.location.origin : ''}${info.webhook_url}`

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold">{info.name}</h3>
            {connected ? (
              <Badge tone="green">Connected</Badge>
            ) : inError ? (
              <Badge tone="red">Error</Badge>
            ) : (
              <Badge>Not connected</Badge>
            )}
            {connection?.test_mode && <Badge>Test mode</Badge>}
          </div>
          <p className="mt-1 text-xs text-gray-500">{info.description}</p>
        </div>
        <div className="flex shrink-0 gap-1 text-[10px] font-bold uppercase text-gray-400">
          {info.supports_label && <span className="rounded-full bg-gray-100 px-2 py-0.5">Label</span>}
          {info.supports_pickup && <span className="rounded-full bg-gray-100 px-2 py-0.5">Pickup</span>}
          {info.supports_rto && <span className="rounded-full bg-gray-100 px-2 py-0.5">RTO</span>}
        </div>
      </div>

      {connection?.last_error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{connection.last_error}</p>
      )}

      {info.credential_fields.length > 0 && (
        <div className="space-y-3">
          {info.credential_fields.map(field => (
            <label key={field.key} className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">
                {field.label}{field.required && <span className="text-red-500"> *</span>}
              </span>
              <input
                type={field.type === 'password' ? 'password' : field.type === 'email' ? 'email' : 'text'}
                value={credentials[field.key] ?? ''}
                onChange={e => setCredentials(prev => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-2.5 text-sm outline-none focus:border-charcoal"
              />
            </label>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plug className="mr-1 h-3 w-3" />}
          {connected ? 'Update credentials' : 'Connect'}
        </Button>
        {connection && (
          <>
            <Button size="sm" variant="secondary" onClick={test} disabled={testing}>
              {testing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
              Test
            </Button>
            <Button size="sm" variant="secondary" onClick={toggleActive}>
              {connected ? 'Deactivate' : 'Activate'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(true)} className="text-red-600">
              <Trash2 className="mr-1 h-3 w-3" /> Remove
            </Button>
          </>
        )}
      </div>

      {connection && (
        <div className="space-y-2 border-t border-gray-100 pt-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-gray-500">Webhook URL</span>
            <div className="flex min-w-0 items-center gap-1.5">
              <code className="truncate font-mono text-[11px] text-gray-600">{webhook}</code>
              <button onClick={() => onCopy(webhook, `url-${info.id}`)} className="text-gray-400 hover:text-charcoal">
                {copied === `url-${info.id}` ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {connection.webhook_secret && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-500">Webhook secret</span>
              <div className="flex min-w-0 items-center gap-1.5">
                <code className={cn('truncate font-mono text-[11px]', reveal ? 'text-gray-700' : 'select-none text-gray-300 blur-[3px]')}>{connection.webhook_secret}</code>
                <button onClick={() => onCopy(connection.webhook_secret ?? '', `sec-${info.id}`)} className="shrink-0 text-gray-400 hover:text-charcoal">
                  {copied === `sec-${info.id}` ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => setReveal(v => !v)} className="shrink-0 text-gray-400 hover:text-charcoal">{reveal ? 'Hide' : 'Show'}</button>
              </div>
            </div>
          )}

          {connection.last_tested_at && (
            <p className="text-gray-400">Last tested · {formatDateTime(connection.last_tested_at)}</p>
          )}
        </div>
      )}

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title={`Disconnect ${info.name}?`}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Existing shipments are untouched. New shipments will use another connected courier or the test courier.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button onClick={remove} className="bg-red-600 hover:bg-red-700">Disconnect</Button>
          </div>
        </div>
      </Dialog>
    </Card>
  )
}