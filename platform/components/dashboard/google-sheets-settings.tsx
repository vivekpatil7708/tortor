'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, Check, ExternalLink, FileSpreadsheet, RefreshCw, Unplug } from 'lucide-react'
import { api, type GoogleSheetsConnection, type GoogleSheetsStatus } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { LoadError } from '@/components/ui/load-error'

/**
 * Settings -> Google Sheets.
 *
 * The merchant connects a Google account, then pastes a spreadsheet link (or
 * creates a new spreadsheet). ToroPay asks only for the Sheets scope, so it
 * never needs access to the rest of the merchant's Drive.
 */

const cardClass = 'rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm'
const inputClass = 'w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200'
const labelClass = 'mb-1 block text-sm font-semibold text-gray-700'

type Notice = { tone: 'success' | 'error' | 'info'; text: string }

export function GoogleSheetsSettings() {
  const oauthResult = useSearchParams().get('google_sheets')
  const [status, setStatus] = useState<GoogleSheetsStatus | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [spreadsheet, setSpreadsheet] = useState('')
  const [saving, setSaving] = useState('')
  const [disconnecting, setDisconnecting] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  function applyConnection(connection: GoogleSheetsConnection) {
    setStatus(prev => prev ? {
      ...prev,
      connected: true,
      can_export: Boolean(connection.spreadsheet_id),
      connection,
    } : prev)
    setSpreadsheet(connection.spreadsheet_url || '')
  }

  function load() {
    setState('loading')
    api.getGoogleSheets()
      .then(data => {
        setStatus(data)
        setSpreadsheet(data.connection?.spreadsheet_url || '')
        setState('ready')
      })
      .catch(() => setState('failed'))
  }

  useEffect(load, [])

  useEffect(() => {
    if (!oauthResult) return
    if (oauthResult === 'connected') {
      setNotice({ tone: 'success', text: 'Google account connected. Choose a spreadsheet to start syncing.' })
    } else if (oauthResult === 'denied') {
      setNotice({ tone: 'info', text: 'Google access was cancelled. You can try again any time.' })
    } else if (oauthResult === 'not_configured') {
      setNotice({ tone: 'error', text: 'Google Sheets is not configured on this server yet.' })
    } else if (oauthResult === 'owner_only') {
      setNotice({ tone: 'error', text: 'Only the account owner can connect Google Sheets.' })
    } else {
      setNotice({ tone: 'error', text: 'Could not connect Google Sheets. Please try again.' })
    }
  }, [oauthResult])

  async function saveSpreadsheet(e: React.FormEvent) {
    e.preventDefault()
    if (!spreadsheet.trim() || saving) return
    setSaving('spreadsheet')
    setNotice(null)
    try {
      const { connection } = await api.saveGoogleSheets({ spreadsheet: spreadsheet.trim() })
      applyConnection(connection)
      setNotice({
        tone: 'success',
        text: `Connected to ${connection.spreadsheet_name || 'the spreadsheet'} (${connection.sheet_name}).`,
      })
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Could not save that spreadsheet.' })
    } finally {
      setSaving('')
    }
  }

  async function createSpreadsheet() {
    if (saving) return
    setSaving('create')
    setNotice(null)
    try {
      const { connection } = await api.createGoogleSheetsSpreadsheet({ title: 'ToroPay Transactions' })
      applyConnection(connection)
      setNotice({ tone: 'success', text: 'New spreadsheet created and ready for payments.' })
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Could not create a spreadsheet.' })
    } finally {
      setSaving('')
    }
  }

  async function toggleAutoExport(enabled: boolean) {
    if (saving) return
    setSaving('auto')
    setNotice(null)
    try {
      const { connection } = await api.saveGoogleSheets({ auto_export: enabled })
      applyConnection(connection)
      setNotice({
        tone: 'success',
        text: enabled
          ? 'New confirmed payments will be added automatically.'
          : 'Automatic export is off. You can still export from Transactions.',
      })
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Could not change automatic export.' })
    } finally {
      setSaving('')
    }
  }

  async function disconnect() {
    setDisconnecting(true)
    setNotice(null)
    try {
      await api.disconnectGoogleSheets()
      setStatus(prev => prev ? { ...prev, connected: false, can_export: false, connection: null } : prev)
      setSpreadsheet('')
      setConfirmDisconnect(false)
      setNotice({ tone: 'success', text: 'Google Sheets disconnected. Rows already added are untouched.' })
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Could not disconnect Google Sheets.' })
    } finally {
      setDisconnecting(false)
    }
  }

  if (state === 'loading') return <p className="text-sm text-gray-500">Loading Google Sheets…</p>
  if (state === 'failed' || !status) return <LoadError what="Google Sheets settings" onRetry={load} />

  const connection = status.connection
  const manage = status.can_manage

  return (
    <div className="space-y-4" role="tabpanel" id="panel-sheets" aria-labelledby="tab-sheets">
      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`rounded-xl px-4 py-3 text-sm ${
            notice.tone === 'error'
              ? 'bg-red-50 text-red-700'
              : notice.tone === 'success'
                ? 'bg-green-50 text-green-700'
                : 'bg-gray-50 text-gray-600'
          }`}
        >
          {notice.text}
        </div>
      )}

      {!status.available && (
        <div className={`${cardClass} border-amber-200 bg-amber-50/70`}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
            <div>
              <h2 className="font-bold text-amber-900">Google Sheets is not available yet</h2>
              <p className="mt-1 text-sm text-amber-800">
                The database migration has not been run. Run{' '}
                <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">platform/prisma/migrations/add_google_sheets.sql</code>{' '}
                and reload this page.
              </p>
            </div>
          </div>
        </div>
      )}

      {status.available && !status.configured && (
        <div className={`${cardClass} border-amber-200 bg-amber-50/70`}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
            <div>
              <h2 className="font-bold text-amber-900">Google Sheets is not configured</h2>
              <p className="mt-1 text-sm text-amber-800">
                Add <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">GOOGLE_CLIENT_ID</code> and{' '}
                <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">GOOGLE_CLIENT_SECRET</code> to the server,
                then reload this page.
              </p>
            </div>
          </div>
        </div>
      )}

      {status.available && status.configured && !connection && (
        <div className={cardClass}>
          <div className="mb-4 flex items-start gap-3">
            <FileSpreadsheet className="mt-0.5 h-6 w-6 shrink-0 text-green-700" aria-hidden />
            <div>
              <h2 className="font-bold">Export payments to Google Sheets</h2>
              <p className="mt-1 text-sm text-gray-500">
                Connect your Google account and choose a spreadsheet. Each confirmed payment is added as a row with
                date, customer, amount, payment reference, order ID and status.
              </p>
            </div>
          </div>

          <div className="mb-5 grid gap-2 rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-600 sm:grid-cols-2">
            <span>Date</span>
            <span>Customer Name</span>
            <span>Phone</span>
            <span>Amount</span>
            <span>Payment Reference</span>
            <span>Order ID</span>
            <span>Status</span>
          </div>

          {manage ? (
            <Button type="button" onClick={() => window.location.assign('/api/integrations/google-sheets/connect')}>
              Connect Google account
            </Button>
          ) : (
            <p className="text-sm text-gray-500">Only the account owner can connect Google Sheets.</p>
          )}

          <p className="mt-3 text-xs text-gray-500">
            ToroPay asks only for permission to edit spreadsheets. It does not request access to the rest of your
            Google Drive.
          </p>
        </div>
      )}

      {status.available && connection && (
        <>
          <div className={cardClass}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
                  <Check className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <h2 className="font-bold">Google Sheets connected</h2>
                  <p className="text-sm text-gray-500">
                    {connection.google_email || 'Google account'} can edit the spreadsheet below.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {manage && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => window.location.assign('/api/integrations/google-sheets/connect')}
                    disabled={!!saving}
                  >
                    Reconnect Google account
                  </Button>
                )}
                <Button type="button" variant="ghost" size="sm" onClick={load} disabled={!!saving}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Refresh
                </Button>
              </div>
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Spreadsheet</dt>
                <dd className="mt-1">
                  {connection.spreadsheet_url ? (
                    <a href={connection.spreadsheet_url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-charcoal underline">
                      {connection.spreadsheet_name || 'Open spreadsheet'}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  ) : (
                    <span className="text-amber-700">Not chosen yet</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Tab</dt>
                <dd className="mt-1">{connection.sheet_name}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Last export</dt>
                <dd className="mt-1">
                  {connection.last_exported_at
                    ? new Date(connection.last_exported_at).toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                        timeZone: 'Asia/Kolkata',
                      })
                    : 'No payments exported yet'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Automatic export</dt>
                <dd className="mt-1">
                  <label className={`flex items-center gap-2 ${manage ? '' : 'opacity-60'}`}>
                    <input
                      type="checkbox"
                      checked={connection.auto_export}
                      disabled={!manage || !!saving}
                      onChange={e => toggleAutoExport(e.target.checked)}
                    />
                    Add every confirmed payment
                  </label>
                </dd>
              </div>
            </dl>

            {connection.last_error && (
              <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
                Last export problem: {connection.last_error}
              </p>
            )}
          </div>

          <form onSubmit={saveSpreadsheet} className={`${cardClass} space-y-3`}>
            <div>
              <h2 className="font-bold">{connection.spreadsheet_id ? 'Use a different spreadsheet' : 'Choose a spreadsheet'}</h2>
              <p className="mt-1 text-sm text-gray-500">
                Paste the spreadsheet link from your browser, or just the spreadsheet ID. The connected Google account
                must be able to edit it.
              </p>
            </div>
            <div>
              <label htmlFor="google-sheet-url" className={labelClass}>Google Sheets link or ID</label>
              <input
                id="google-sheet-url"
                value={spreadsheet}
                onChange={e => setSpreadsheet(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className={inputClass}
                disabled={!manage || !!saving}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!manage || !spreadsheet.trim() || !!saving}>
                {saving === 'spreadsheet' ? 'Checking…' : connection.spreadsheet_id ? 'Save spreadsheet' : 'Use this spreadsheet'}
              </Button>
              {manage && (
                <Button type="button" variant="secondary" onClick={createSpreadsheet} disabled={!!saving}>
                  {saving === 'create' ? 'Creating…' : 'Create a new spreadsheet'}
                </Button>
              )}
            </div>
            <p className="text-xs text-gray-500">
              The first row is filled with the column headings if the tab is empty. Existing rows are never changed.
            </p>
          </form>

          <div className={`${cardClass} flex flex-wrap items-start justify-between gap-3`}>
            <div>
              <h2 className="font-bold">Disconnect Google Sheets</h2>
              <p className="mt-1 text-sm text-gray-500">
                Stops automatic exports and forgets the Google account. Rows already in the spreadsheet stay there.
              </p>
            </div>
            <Button
              type="button"
              variant="danger"
              onClick={() => setConfirmDisconnect(true)}
              disabled={!manage || disconnecting}
            >
              <Unplug className="mr-1.5 h-4 w-4" aria-hidden /> Disconnect
            </Button>
          </div>
        </>
      )}

      <p className="text-sm text-gray-500">
        Looking for transactions? Open{' '}
        <Link href="/dashboard/transactions" className="font-semibold text-charcoal underline">Transactions</Link>{' '}
        and use &quot;Export to Sheets&quot;.
      </p>

      {confirmDisconnect && (
        <ConfirmDialog
          open
          onClose={() => { if (!disconnecting) setConfirmDisconnect(false) }}
          onConfirm={disconnect}
          title="Disconnect Google Sheets?"
          message="Automatic exports will stop and the Google account will be forgotten. Rows already in the spreadsheet are not deleted."
          confirmLabel="Disconnect"
          danger
          busy={disconnecting}
        />
      )}
    </div>
  )
}
