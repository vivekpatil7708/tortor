'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { LoadError } from '@/components/ui/load-error'
import Link from 'next/link'
import { MessageSquare } from 'lucide-react'

export default function SettingsPage() {
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  // The form only shows once the saved settings have loaded, so Save can never
  // overwrite them (or the webhook secret) with blanks after a failed load.
  const [settingsState, setSettingsState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [keysFailed, setKeysFailed] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const [newApiKeyName, setNewApiKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState('')
  const [apiKeys, setApiKeys] = useState<Record<string, unknown>[]>([])

  const [form, setForm] = useState({
    notification_email: '', notification_phone: '',
    sms_enabled: false, email_enabled: false,
    webhook_secret: '',
  })

  function loadSettings() {
    setSettingsState('loading')
    api.getSettings()
      .then(s => { setForm(f => ({ ...f, ...s })); setSettingsState('ready') })
      .catch(() => setSettingsState('failed'))
  }

  function loadKeys() {
    api.getApiKeys()
      .then(keys => { setApiKeys(keys); setKeysFailed(false) })
      .catch(() => setKeysFailed(true))
  }

  useEffect(() => {
    loadSettings()
    loadKeys()
  }, [])

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    if (settingsState !== 'ready') return
    setSaving(true)
    setSaveError('')
    try {
      await api.saveSettings(form)
      setMsg('Settings saved')
      setTimeout(() => setMsg(''), 3000)
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Could not save your settings')
    } finally {
      setSaving(false)
    }
  }

  async function createKey() {
    try {
      const { key } = await api.createApiKey(newApiKeyName || 'Default')
      setCreatedKey(key)
      setNewApiKeyName('')
      loadKeys()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed')
    }
  }

  async function signOutOtherDevices() {
    setSigningOut(true)
    setSignOutError('')
    try {
      await api.logoutOtherDevices()
      setConfirmSignOut(false)
      setMsg('Signed out on all other devices')
      setTimeout(() => setMsg(''), 4000)
    } catch (err: unknown) {
      setSignOutError(err instanceof Error ? err.message : 'Could not sign out other devices')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-gray-500">Account, notifications, and API access.</p>
      </div>

      {msg && <div className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-600">{msg}</div>}

      <div className="mb-6 rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold">Messaging</h2>
            <p className="text-xs text-gray-500">Manage confirmation message templates for Email, WhatsApp, and Instagram.</p>
          </div>
          <Link href="/dashboard/settings/messaging" className="flex items-center gap-1.5 rounded-xl bg-charcoal px-4 py-2 text-xs font-semibold text-white hover:opacity-90">
            <MessageSquare className="h-3.5 w-3.5" /> Manage Templates
          </Link>
        </div>
      </div>

      {settingsState === 'failed' && <LoadError what="your settings" onRetry={loadSettings} className="mb-6" />}
      {settingsState === 'loading' && <p className="mb-6 text-sm text-gray-400">Loading settings…</p>}

      {settingsState === 'ready' && (
      <form onSubmit={saveSettings} className="mb-6 space-y-5">
        <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
          <h2 className="mb-1 font-bold">Notifications</h2>
          <p className="mb-4 text-xs text-gray-500">
            Get an email when a customer taps &quot;I&apos;ve paid&quot; on one of your links, so you can check and confirm it.
            At most 20 emails an hour.
          </p>
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.email_enabled} onChange={e => setForm({ ...form, email_enabled: e.target.checked })} />
              Email me when a customer says they&apos;ve paid
            </label>
            <input type="email" placeholder="Send alerts to (leave empty to use your login email)" value={form.notification_email}
              onChange={e => setForm({ ...form, notification_email: e.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none" />
          </div>
        </div>

        <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
          <h2 className="mb-4 font-bold">Webhooks</h2>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Webhook signing secret</label>
          <input value={form.webhook_secret} onChange={e => setForm({ ...form, webhook_secret: e.target.value })}
            placeholder="Created automatically with your first webhook"
            className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none" />
          <p className="mt-1.5 text-xs text-gray-500">
            Every webhook is signed in the X-ToroPay-Signature header. To check signatures on your server,
            enter your own secret here and use the same value there.
          </p>
        </div>

        {saveError && <p className="text-sm text-red-500">Couldn&apos;t save: {saveError}</p>}
        <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</Button>
      </form>
      )}

      <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
        <h2 className="mb-4 font-bold">API Keys</h2>
        <p className="mb-4 text-xs text-gray-500">Create API keys for programmatic access.</p>
        <div className="mb-4 flex gap-2">
          <input value={newApiKeyName} onChange={e => setNewApiKeyName(e.target.value)} placeholder="Key name"
            className="flex-1 rounded-xl border border-gray-200 bg-white/70 px-4 py-2 text-sm outline-none" />
          <Button type="button" variant="secondary" onClick={createKey}>Create</Button>
        </div>
        {createdKey && (
          <div className="mb-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
            Copy now — won&apos;t be shown again:<br />
            <code className="break-all font-mono">{createdKey}</code>
          </div>
        )}
        {keysFailed && <LoadError what="your API keys" onRetry={loadKeys} className="mb-2" />}
        {apiKeys.map(k => (
          <div key={k.id as string} className="mb-2 flex justify-between rounded-lg bg-white/50 px-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              {k.name as string}
              {Boolean(k.revoked_at) && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-600">Revoked</span>
              )}
            </span>
            <span className="font-mono text-xs text-gray-400">{k.key_prefix as string}...</span>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
        <h2 className="mb-1 font-bold">Security</h2>
        <p className="mb-4 text-xs text-gray-500">
          Logged in on a phone or computer you no longer use, or think someone else knows your password?
          Sign out everywhere else. You stay logged in here.
        </p>
        <Button type="button" variant="danger" onClick={() => { setSignOutError(''); setConfirmSignOut(true) }}>
          Sign out other devices
        </Button>
      </div>

      {confirmSignOut && (
        <ConfirmDialog
          open
          onClose={() => { if (!signingOut) setConfirmSignOut(false) }}
          onConfirm={signOutOtherDevices}
          title="Sign out other devices?"
          message={'Everyone using this account on another phone or computer will need to log in again.' + (signOutError ? ` Error: ${signOutError}` : '')}
          confirmLabel="Sign out other devices"
          danger
          busy={signingOut}
        />
      )}
    </div>
  )
}
