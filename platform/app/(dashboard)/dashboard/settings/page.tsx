'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { MessageSquare } from 'lucide-react'

export default function SettingsPage() {
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [newApiKeyName, setNewApiKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState('')
  const [apiKeys, setApiKeys] = useState<Record<string, unknown>[]>([])

  const [form, setForm] = useState({
    notification_email: '', notification_phone: '',
    sms_enabled: false, email_enabled: false,
    webhook_secret: '',
  })

  const [profile, setProfile] = useState({
    business_name: '', support_email: '', support_phone: '',
    address: '', default_currency: 'INR', timezone: 'Asia/Kolkata',
  })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')

  useEffect(() => {
    api.getSettings().then(s => setForm(f => ({ ...f, ...s }))).catch(() => {})
    api.getApiKeys().then(setApiKeys).catch(() => {})
    api.getMerchantProfile().then(({ profile }) => setProfile(p => ({ ...p, ...profile }))).catch(() => {})
  }, [])

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setProfileSaving(true)
    try {
      await api.updateMerchantProfile(profile)
      setProfileMsg('Store profile saved')
      setTimeout(() => setProfileMsg(''), 3000)
    } finally {
      setProfileSaving(false)
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.saveSettings(form)
      setMsg('Settings saved')
      setTimeout(() => setMsg(''), 3000)
    } finally {
      setSaving(false)
    }
  }

  async function createKey() {
    try {
      const { key } = await api.createApiKey(newApiKeyName || 'Default')
      setCreatedKey(key)
      setNewApiKeyName('')
      api.getApiKeys().then(setApiKeys)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed')
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-gray-500">Account, notifications, and API access.</p>
      </div>

      {msg && <div className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-600">{msg}</div>}

      <form onSubmit={saveProfile} className="mb-6 rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
        <h2 className="mb-4 font-bold">Store profile</h2>
        {profileMsg && <div className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-600">{profileMsg}</div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Business name</span>
            <input value={profile.business_name} onChange={e => setProfile({ ...profile, business_name: e.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Support email</span>
            <input value={profile.support_email} onChange={e => setProfile({ ...profile, support_email: e.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Support phone</span>
            <input value={profile.support_phone} onChange={e => setProfile({ ...profile, support_phone: e.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Default currency</span>
            <select value={profile.default_currency} onChange={e => setProfile({ ...profile, default_currency: e.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none">
              <option value="INR">INR — Indian Rupee</option>
              <option value="USD">USD — US Dollar</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Timezone</span>
            <select value={profile.timezone} onChange={e => setProfile({ ...profile, timezone: e.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none">
              <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
              <option value="Asia/Dubai">Asia/Dubai (GST)</option>
              <option value="UTC">UTC</option>
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Business address</span>
            <input value={profile.address} onChange={e => setProfile({ ...profile, address: e.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none" />
          </label>
        </div>
        <Button type="submit" disabled={profileSaving}>{profileSaving ? 'Saving...' : 'Save profile'}</Button>
      </form>

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

      <form onSubmit={saveSettings} className="mb-6 space-y-5">
        <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
          <h2 className="mb-4 font-bold">Notifications</h2>
          <div className="space-y-4">
            <input placeholder="Notification email" value={form.notification_email}
              onChange={e => setForm({ ...form, notification_email: e.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none" />
            <input placeholder="Notification phone" value={form.notification_phone}
              onChange={e => setForm({ ...form, notification_phone: e.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.sms_enabled} onChange={e => setForm({ ...form, sms_enabled: e.target.checked })} /> SMS alerts
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.email_enabled} onChange={e => setForm({ ...form, email_enabled: e.target.checked })} /> Email alerts
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
          <h2 className="mb-4 font-bold">Webhooks</h2>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Webhook signing secret</label>
          <input value={form.webhook_secret} onChange={e => setForm({ ...form, webhook_secret: e.target.value })}
            placeholder="Optional HMAC secret for outbound webhooks"
            className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none" />
        </div>

        <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</Button>
      </form>

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
        {apiKeys.map(k => (
          <div key={k.id as string} className="mb-2 flex justify-between rounded-lg bg-white/50 px-3 py-2 text-sm">
            <span>{k.name as string}</span>
            <span className="font-mono text-xs text-gray-400">{k.key_prefix as string}...</span>
          </div>
        ))}
      </div>
    </div>
  )
}
