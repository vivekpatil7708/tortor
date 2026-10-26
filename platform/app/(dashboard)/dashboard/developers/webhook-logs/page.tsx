'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronDown, RefreshCw, RotateCcw } from 'lucide-react'
import { api, type WebhookLogRow, type WebhookLogsResponse } from '@/lib/api'
import { WEBHOOK_EVENTS } from '@/lib/webhook-events'
import { Button } from '@/components/ui/button'
import { LoadError } from '@/components/ui/load-error'

const STATUS_TABS = [
  { value: 'failed', label: 'Failed' },
  { value: 'retrying', label: 'Retrying' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'all', label: 'All' },
] as const

const STATUS_STYLES: Record<string, string> = {
  delivered: 'bg-green-100 text-green-700',
  pending: 'bg-gray-100 text-gray-600',
  retrying: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-600',
  disabled: 'bg-gray-100 text-gray-500',
}

function prettyPayload(payload: string): string {
  try {
    return JSON.stringify(JSON.parse(payload), null, 2)
  } catch {
    return payload
  }
}

function LogRow({ log, onRetried }: { log: WebhookLogRow; onRetried: () => void }) {
  const [open, setOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [message, setMessage] = useState('')
  const canRetry = log.status === 'failed' || log.status === 'retrying'

  async function retry() {
    setRetrying(true)
    setMessage('')
    try {
      const res = await api.retryWebhookLog(log.id)
      setMessage(res.status === 'delivered' ? 'Delivered on retry.' : `Retry queued (${res.status}).`)
      onRetried()
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Could not retry this delivery')
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLES[log.status] || 'bg-gray-100 text-gray-600'}`}>
              {log.status}
            </span>
            <span className="font-mono text-xs font-semibold text-gray-700">{log.event_type}</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500">
              {log.endpoint_mode}
            </span>
            {log.response_code != null && (
              <span className="text-[11px] text-gray-400">HTTP {log.response_code}</span>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-gray-500">{log.endpoint_url}</p>
          <p className="mt-0.5 text-[11px] text-gray-400">
            {new Date(log.created_at).toLocaleString('en-IN')}
            {log.retry_count > 0 ? ` · ${log.retry_count} retr${log.retry_count === 1 ? 'y' : 'ies'}` : ''}
            {log.next_retry_at ? ` · next ${new Date(log.next_retry_at).toLocaleString('en-IN')}` : ''}
          </p>
          {log.error_message && (
            <p className="mt-1 flex items-start gap-1 text-[11px] text-red-600">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{log.error_message}</span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canRetry && (
            <Button type="button" size="sm" variant="secondary" onClick={retry} disabled={retrying}>
              <RotateCcw className={`mr-1.5 h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
              {retrying ? 'Retrying…' : 'Retry'}
            </Button>
          )}
          <button
            type="button"
            onClick={() => setOpen(value => !value)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-charcoal"
            aria-label={open ? 'Hide delivery details' : 'Show delivery details'}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {message && <p role="status" className="mt-2 text-xs text-gray-600">{message}</p>}

      {open && (
        <div className="mt-3 space-y-2 rounded-xl bg-gray-50 p-3 text-[11px] text-gray-600">
          <p><span className="font-semibold">Event ID:</span> <span className="font-mono">{log.event_id}</span></p>
          <p><span className="font-semibold">Delivery URL:</span> <span className="break-all font-mono">{log.url}</span></p>
          {log.delivered_at && <p><span className="font-semibold">Delivered:</span> {new Date(log.delivered_at).toLocaleString('en-IN')}</p>}
          {log.response_body && (
            <div>
              <p className="font-semibold">Response body</p>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white p-2 font-mono">{log.response_body}</pre>
            </div>
          )}
          <div>
            <p className="font-semibold">Payload</p>
            <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white p-2 font-mono">{prettyPayload(log.payload)}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default function WebhookLogsPage() {
  const [status, setStatus] = useState<string>('failed')
  const [endpointId, setEndpointId] = useState('')
  const [eventType, setEventType] = useState('')
  const [data, setData] = useState<WebhookLogsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  function load() {
    setLoading(true)
    setFailed(false)
    api.getWebhookLogs({ status, endpointId: endpointId || undefined, eventType: eventType || undefined })
      .then(result => { setData(result); setLoading(false) })
      .catch(() => { setFailed(true); setLoading(false) })
  }

  useEffect(() => {
    load()
    // Reload when a filter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, endpointId, eventType])

  function refresh() {
    setRefreshing(true)
    api.getWebhookLogs({ status, endpointId: endpointId || undefined, eventType: eventType || undefined })
      .then(result => setData(result))
      .catch(() => setFailed(true))
      .finally(() => setRefreshing(false))
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/developers" className="text-xs font-semibold text-gray-500 hover:text-charcoal">
            ← Back to developers
          </Link>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Webhook logs</h1>
          <p className="text-sm text-gray-500">
            Every delivery attempt, including failures. Retry a failed delivery without recreating the event.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/webhooks" className="text-xs font-semibold text-gray-500 hover:text-charcoal">
            Manage endpoints
          </Link>
          <Button type="button" size="sm" variant="secondary" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map(tab => {
          const count = tab.value === 'all'
            ? Object.values(data?.counts ?? {}).reduce((sum, n) => sum + n, 0)
            : data?.counts[tab.value] ?? 0
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatus(tab.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                status === tab.value ? 'bg-charcoal text-white' : 'bg-white/70 text-gray-600 hover:bg-white'
              }`}
            >
              {tab.label} <span className="opacity-70">({count})</span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={endpointId}
          onChange={e => setEndpointId(e.target.value)}
          aria-label="Filter by endpoint"
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:border-gray-500"
        >
          <option value="">All endpoints</option>
          {data?.endpoints.map(endpoint => (
            <option key={endpoint.id} value={endpoint.id}>{endpoint.url} ({endpoint.mode})</option>
          ))}
        </select>
        <select
          value={eventType}
          onChange={e => setEventType(e.target.value)}
          aria-label="Filter by event"
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:border-gray-500"
        >
          <option value="">All events</option>
          {WEBHOOK_EVENTS.map(event => (
            <option key={event.value} value={event.value}>{event.label}</option>
          ))}
        </select>
      </div>

      {failed && <LoadError what="webhook logs" onRetry={load} />}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : !data || data.logs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-500">
          {status === 'failed'
            ? 'No failed deliveries. Your endpoints are keeping up.'
            : 'No deliveries match these filters yet.'}
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-400">
            Showing {data.logs.length} of {data.total} matching deliveries
            {data.total > data.logs.length ? ' (newest first)' : ''}
          </p>
          <div className="space-y-3">
            {data.logs.map(log => (
              <LogRow key={log.id} log={log} onRetried={refresh} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
