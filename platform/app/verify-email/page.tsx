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
    <div className="auth-shell flex min-h-screen items-center justify-center bg-blue-hero px-4">
      <div className="w-full max-w-sm rounded-3xl border border-white/60 bg-white/95 p-8 text-center shadow-2xl shadow-black/20 backdrop-blur-2xl">
        <span className="text-xl font-extrabold tracking-tight">
          Toro<span className="text-primary-500">Pay</span>
        </span>
        {state === 'checking' && <p className="mt-6 text-sm text-gray-600">Verifying your email...</p>}
        {state === 'verified' && (
          <>
            <h1 className="mt-4 text-lg font-bold text-green-600">Email verified</h1>
            <p className="mt-1 text-sm text-gray-600">You can now create payment links and take payments.</p>
          </>
        )}
        {state === 'failed' && (
          <>
            <h1 className="mt-4 text-lg font-bold text-red-600">Could not verify</h1>
            <p className="mt-1 text-sm text-gray-600">{error} You can request a new link from your dashboard.</p>
          </>
        )}
        <Link href="/dashboard" className="mt-6 inline-block rounded-xl btn-blue-gradient px-6 py-3 text-sm font-semibold text-white">
          Go to dashboard
        </Link>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-ink text-sm text-gray-400">Loading...</div>}>
      <VerifyEmail />
    </Suspense>
  )
}
