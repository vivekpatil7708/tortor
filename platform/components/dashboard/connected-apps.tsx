'use client'

import { useEffect, useState } from 'react'
import { Plug, Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LoadError } from '@/components/ui/load-error'
import { ConfirmDialog } from '@/components/ui/dialog'
import CopyButton from '@/components/ui/copy-button'

/**
 * Settings → Connected apps: the AI assistants (Claude, Grok, …) that signed in
 * with this merchant's ToroPay account through OAuth. Each row is one access
 * token; disconnecting revokes it, so that client loses access immediately.
 */

interface ConnectedApp {
  id: string
  clientName: string
  scopes: string[]
  createdAt: string
  expiresAt: string
  revokedAt: string | null
  status: 'active' | 'revoked' | 'expired'
}

const MCP_URL = 'https://toropay-mcp.vercel.app/mcp'

const SCOPE_LABELS: Record<string, string> = {
  read: 'View your transactions, payment links and analytics',
  write: 'Create and confirm payments on your behalf',
}

const date = (value: string) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export function ConnectedApps() {
  const [apps, setApps] = useState<ConnectedApp[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [pending, setPending] = useState<ConnectedApp | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function load() {
    setState('loading')
    fetch('/api/oauth/tokens')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Could not load'))))
      .then((data: ConnectedApp[]) => { setApps(data); setState('ready') })
      .catch(() => setState('failed'))
  }

  useEffect(() => { load() }, [])

  async function disconnect() {
    if (!pending || busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/oauth/tokens/${pending.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Could not revoke access')
      setPending(null)
      setNotice(`${pending.clientName} can no longer access your account.`)
      setTimeout(() => setNotice(''), 4000)
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not revoke access')
    } finally {
      setBusy(false)
    }
  }

  const visible = apps.filter((app) => app.status !== 'revoked')

  return (
    <div role="tabpanel" id="panel-apps" aria-labelledby="tab-apps" className="space-y-4">
      <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
        <h2 className="mb-1 font-bold">Connected apps</h2>
        <p className="text-sm text-gray-500">
          AI assistants you have connected to this account. To connect one, add{' '}
          <span className="font-mono text-xs">{MCP_URL}</span> as an MCP connector and sign in with your ToroPay account.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code className="truncate rounded-lg bg-white px-3 py-1.5 font-mono text-xs text-gray-700">{MCP_URL}</code>
          <CopyButton text={MCP_URL} label="Copy URL" className="bg-white text-charcoal shadow-sm" />
        </div>
      </div>

      {notice && <div role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>}
      {state === 'failed' && <LoadError what="your connected apps" onRetry={load} />}
      {state === 'loading' && <p className="text-sm text-gray-500">Loading…</p>}

      {state === 'ready' && visible.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-500">
          Nothing connected yet.
        </div>
      )}

      {state === 'ready' && visible.map((app) => (
        <div key={app.id} className="rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Plug className="h-4 w-4 text-gray-500" />
                <p className="font-bold">{app.clientName}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${app.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {app.status === 'active' ? 'Connected' : 'Expired'}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Connected {date(app.createdAt)}
                {app.status === 'active' ? ` · access expires ${date(app.expiresAt)}` : ' · sign in again to reconnect'}
              </p>
              <ul className="mt-1 text-xs text-gray-500">
                {app.scopes.map((scope) => <li key={scope}>{SCOPE_LABELS[scope] || scope}</li>)}
              </ul>
            </div>
            {app.status === 'active' && (
              <Button type="button" variant="danger" size="sm" onClick={() => { setError(''); setPending(app) }}>
                <Unplug className="mr-1.5 h-4 w-4" /> Disconnect
              </Button>
            )}
          </div>
        </div>
      ))}

      {pending && (
        <ConfirmDialog
          open
          onClose={() => { if (!busy) setPending(null) }}
          onConfirm={disconnect}
          title={`Disconnect ${pending.clientName}?`}
          message={'It will lose access to your ToroPay account immediately. You can connect it again later.' + (error ? ` Error: ${error}` : '')}
          confirmLabel="Disconnect"
          danger
          busy={busy}
        />
      )}
    </div>
  )
}
