'use client'

import { useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

export function AcceptInviteForm({
  token,
  businessName,
  roleLabel,
  inviteEmail,
  signedInEmail,
}: {
  token: string
  businessName: string
  roleLabel: string
  inviteEmail: string
  signedInEmail: string | null
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const next = `/accept-invite/${encodeURIComponent(token)}`
  const nextQuery = encodeURIComponent(next)
  const canAccept = Boolean(signedInEmail && signedInEmail.toLowerCase() === inviteEmail.toLowerCase())

  async function accept() {
    setError('')
    setLoading(true)
    try {
      await api.acceptTeamInvite(token)
      // A full navigation makes sure the new session cookie is used.
      window.location.assign('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not accept the invitation')
      setLoading(false)
    }
  }

  async function switchAccount() {
    try {
      await api.logout()
    } catch {
      // The login page will still be reachable.
    }
    window.location.assign(`/login?next=${nextQuery}`)
  }

  if (!signedInEmail) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Sign in with <strong className="text-charcoal">{inviteEmail}</strong> to accept this invitation.
          If you do not have a ToroPay account yet, create one with that email first.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/login?next=${nextQuery}`}
            className="inline-flex flex-1 items-center justify-center rounded-xl btn-blue-gradient px-5 py-2.5 text-sm font-semibold text-white transition-all active:scale-95"
          >
            Log in
          </Link>
          <Link
            href={`/signup?next=${nextQuery}`}
            className="inline-flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-charcoal transition-all hover:bg-gray-50 active:scale-95"
          >
            Create account
          </Link>
        </div>
      </div>
    )
  }

  if (!canAccept) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          You are signed in as <strong className="text-charcoal">{signedInEmail}</strong>, but this
          invitation was sent to <strong className="text-charcoal">{inviteEmail}</strong>.
        </p>
        <Button variant="secondary" onClick={switchAccount} disabled={loading}>
          Sign out and switch account
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        You will join <strong className="text-charcoal">{businessName}</strong> as a{' '}
        <strong className="text-charcoal">{roleLabel}</strong> using your own login.
      </p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <Button onClick={accept} disabled={loading} className="w-full">
        {loading ? 'Accepting…' : 'Accept invitation'}
      </Button>
    </div>
  )
}
