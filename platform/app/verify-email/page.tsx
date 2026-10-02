'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

function VerifyEmail() {
  const token = useSearchParams().get('token') || ''
  const [state, setState] = useState<'checking' | 'verified' | 'failed'>('checking')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setState('failed')
      setError('This verification link is incomplete.')
      return
    }
    fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async res => {
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          setState('verified')
        } else {
          setState('failed')
          setError(data.error || 'Verification failed')
        }
      })
      .catch(() => {
        setState('failed')
        setError('Network error. Please try again.')
      })
  }, [token])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-cream to-beige px-4">
      <div className="w-full max-w-sm rounded-3xl border border-white/60 bg-white/40 p-8 text-center backdrop-blur-xl">
        <span className="text-xl font-extrabold tracking-tight">
          Toro<span className="text-primary-500">Pay</span>
        </span>
        {state === 'checking' && <p className="mt-6 text-sm text-gray-500">Verifying your email...</p>}
        {state === 'verified' && (
          <>
            <h1 className="mt-4 text-lg font-bold text-green-600">Email verified</h1>
            <p className="mt-1 text-sm text-gray-500">You can now create payment links and take payments.</p>
          </>
        )}
        {state === 'failed' && (
          <>
            <h1 className="mt-4 text-lg font-bold text-red-600">Could not verify</h1>
            <p className="mt-1 text-sm text-gray-500">{error} You can request a new link from your dashboard.</p>
          </>
        )}
        <Link href="/dashboard" className="mt-6 inline-block rounded-xl bg-charcoal px-6 py-3 text-sm font-semibold text-white hover:opacity-90">
          Go to dashboard
        </Link>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-cream text-sm text-gray-500">Loading...</div>}>
      <VerifyEmail />
    </Suspense>
  )
}
