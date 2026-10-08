'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { LoadError } from '@/components/ui/load-error'

const TABS = [
  { id: 'profile', label: 'Business profile' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'security', label: 'Security' },
] as const
type Tab = (typeof TABS)[number]['id']

const inputClass = 'w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200'
const labelClass = 'mb-1 block text-sm font-semibold text-gray-700'
const cardClass = 'rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm'

export default function SettingsPage() {
  // Settings → Notifications can be linked to directly (?tab=notifications).
  const requested = useSearchParams().get('tab')
  const [tab, setTab] = useState<Tab>(TABS.some(t => t.id === requested) ? (requested as Tab) : 'profile')
  const [msg, setMsg] = useState('')

  // Business profile: shown to customers on receipts and on links that are closed.
  const [profileState, setProfileState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [profile, setProfile] = useState({ business_name: '', support_email: '', support_phone: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState('')

  // Notifications. The form only shows once the saved settings have loaded, so
  // Save can never overwrite them with blanks after a failed load.
  const [settingsState, setSettingsState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [alerts, setAlerts] = useState({ email_enabled: false, notification_email: '' })
  const [savingAlerts, setSavingAlerts] = useState(false)
  const [alertsError, setAlertsError] = useState('')

  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')

  function flash(text: string) {
    setMsg(text)
    setTimeout(() => setMsg(''), 3000)
  }

  function loadProfile() {
    setProfileState('loading')
    api.me()
      .then(({ merchant }) => {
        if (!merchant) throw new Error('Not signed in')
        setProfile({
          business_name: String(merchant.business_name ?? ''),
          support_email: String(merchant.support_email ?? ''),
          support_phone: String(merchant.support_phone ?? ''),
        })
        setProfileState('ready')
      })
      .catch(() => setProfileState('failed'))
  }

  function loadSettings() {
    setSettingsState('loading')
    api.getSettings()
      .then(s => {
        setAlerts({ email_enabled: Boolean(s.email_enabled), notification_email: String(s.notification_email ?? '') })
        setSettingsState('ready')
      })
      .catch(() => setSettingsState('failed'))
  }

  useEffect(() => {
    loadProfile()
    loadSettings()
  }, [])

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (profileState !== 'ready' || savingProfile) return
    setSavingProfile(true)
    setProfileError('')
    try {
      await api.updateMerchant(profile)
      flash('Business profile saved')
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : 'Could not save your business profile')
    } finally {
      setSavingProfile(false)
    }
  }

  async function saveAlerts(e: React.FormEvent) {
    e.preventDefault()
    if (settingsState !== 'ready' || savingAlerts) return
    setSavingAlerts(true)
    setAlertsError('')
    try {
      // Only these two settings are sent, so nothing else (like the webhook secret) changes.
      await api.saveSettings(alerts)
      flash('Notification settings saved')
    } catch (err: unknown) {
      setAlertsError(err instanceof Error ? err.message : 'Could not save your settings')
    } finally {
      setSavingAlerts(false)
    }
  }

  async function signOutOtherDevices() {
    setSigningOut(true)
    setSignOutError('')
    try {
      await api.logoutOtherDevices()
      setConfirmSignOut(false)
      flash('Signed out on all other devices')
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
        <p className="text-sm text-gray-500">Your business details, payment alerts and account security.</p>
      </div>

      <div role="tablist" aria-label="Settings" className="mb-6 flex flex-wrap gap-2">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === t.id ? 'bg-charcoal text-white' : 'bg-white/60 text-gray-600 hover:bg-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {msg && <div role="status" className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{msg}</div>}

      {tab === 'profile' && (
        <div role="tabpanel" id="panel-profile" aria-labelledby="tab-profile">
          {profileState === 'failed' && <LoadError what="your business profile" onRetry={loadProfile} className="mb-6" />}
          {profileState === 'loading' && <p className="mb-6 text-sm text-gray-400">Loading…</p>}
          {profileState === 'ready' && (
            <form onSubmit={saveProfile} className={`${cardClass} space-y-4`}>
              <div>
                <label htmlFor="business-name" className={labelClass}>Business name</label>
                <input id="business-name" value={profile.business_name} maxLength={100}
                  onChange={e => setProfile({ ...profile, business_name: e.target.value })} className={inputClass} />
                <p className="mt-1 text-xs text-gray-500">Shown on your payment pages and in your customers&apos; UPI apps.</p>
              </div>
              <div>
                <label htmlFor="support-email" className={labelClass}>Support email <span className="font-normal text-gray-500">(optional)</span></label>
                <input id="support-email" type="email" value={profile.support_email} placeholder="help@yourbusiness.in"
                  onChange={e => setProfile({ ...profile, support_email: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label htmlFor="support-phone" className={labelClass}>Support phone <span className="font-normal text-gray-500">(optional)</span></label>
                <input id="support-phone" type="tel" value={profile.support_phone} placeholder="+91 98765 43210" maxLength={20}
                  onChange={e => setProfile({ ...profile, support_phone: e.target.value })} className={inputClass} />
                <p className="mt-1 text-xs text-gray-500">
                  Customers see these on their receipt and on links that are closed, so they can reach you about a payment. Leave empty to hide.
                </p>
              </div>
              {profileError && <p role="alert" className="text-sm text-red-600">Couldn&apos;t save: {profileError}</p>}
              <Button type="submit" disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save business profile'}</Button>
            </form>
          )}
        </div>
      )}

      {tab === 'notifications' && (
        <div role="tabpanel" id="panel-notifications" aria-labelledby="tab-notifications">
          {settingsState === 'failed' && <LoadError what="your settings" onRetry={loadSettings} className="mb-6" />}
          {settingsState === 'loading' && <p className="mb-6 text-sm text-gray-400">Loading settings…</p>}
          {settingsState === 'ready' && (
            <form onSubmit={saveAlerts} className={`${cardClass} space-y-4`}>
              <div>
                <h2 className="mb-1 font-bold">Payment alerts</h2>
                <p className="text-sm text-gray-500">
                  Get an email when a customer taps &quot;I&apos;ve paid&quot; on one of your links, so you can check and confirm it.
                  At most 20 emails an hour.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={alerts.email_enabled} onChange={e => setAlerts({ ...alerts, email_enabled: e.target.checked })} />
                Email me when a customer says they&apos;ve paid
              </label>
              <div>
                <label htmlFor="alert-email" className={labelClass}>Send alerts to <span className="font-normal text-gray-500">(optional)</span></label>
                <input id="alert-email" type="email" placeholder="Leave empty to use your login email" value={alerts.notification_email}
                  onChange={e => setAlerts({ ...alerts, notification_email: e.target.value })} className={inputClass} />
              </div>
              {alertsError && <p role="alert" className="text-sm text-red-600">Couldn&apos;t save: {alertsError}</p>}
              <Button type="submit" disabled={savingAlerts}>{savingAlerts ? 'Saving…' : 'Save notifications'}</Button>
            </form>
          )}
        </div>
      )}

      {tab === 'security' && (
        <div role="tabpanel" id="panel-security" aria-labelledby="tab-security" className={cardClass}>
          <h2 className="mb-1 font-bold">Sign out other devices</h2>
          <p className="mb-4 text-sm text-gray-500">
            Logged in on a phone or computer you no longer use, or think someone else knows your password?
            Sign out everywhere else. You stay logged in here.
          </p>
          <Button type="button" variant="danger" onClick={() => { setSignOutError(''); setConfirmSignOut(true) }}>
            Sign out other devices
          </Button>
        </div>
      )}

      <p className="mt-6 text-sm text-gray-500">
        Looking for API keys or the webhook signing secret? They&apos;re under{' '}
        <Link href="/dashboard/developers" className="font-semibold text-charcoal underline">Developers</Link>.
        Message templates are under <Link href="/dashboard/settings/messaging" className="font-semibold text-charcoal underline">Messaging</Link>.
      </p>

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
