'use client'

import { useState } from 'react'

export function VerifyEmailBanner({ email }: { email: string }) {
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')

  async function resend() {
    setSending(true)
    setMessage('')
    try {
      const res = await fetch('/api/auth/verify-email/resend', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      setMessage(res.ok ? 'Sent. Check your inbox.' : data.error || 'Could not send the email.')
    } catch {
      setMessage('Network error. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mb-6 flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
      <p>
        <span className="font-semibold">Verify your email to start taking payments.</span>{' '}
        We sent a link to <span className="break-all font-medium">{email}</span>.
      </p>
      <div className="flex shrink-0 items-center gap-3">
        {message && <span className="text-xs">{message}</span>}
        <button onClick={resend} disabled={sending}
          className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
          {sending ? 'Sending...' : 'Resend email'}
        </button>
      </div>
    </div>
  )
}
