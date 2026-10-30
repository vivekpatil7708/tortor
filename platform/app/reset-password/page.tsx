'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { PASSWORD_RULE_TEXT, passwordProblem } from '@/lib/password-policy'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!token) {
      setError('Missing reset token')
      return
    }
    const problem = passwordProblem(password)
    if (problem) {
      setError(problem)
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to reset password')
      } else {
        setMessage('Password reset successfully!')
        setTimeout(() => router.push('/login'), 2000)
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="auth-shell flex min-h-screen items-center justify-center bg-blue-hero px-4">
        <div className="w-full max-w-sm text-center">
          <div className="rounded-3xl border border-white/60 bg-white/95 p-8 shadow-2xl shadow-black/20 backdrop-blur-2xl">
            <h1 className="text-lg font-bold text-red-600">Invalid reset link</h1>
            <p className="mt-2 text-sm text-gray-600">This link is missing or invalid.</p>
            <Link href="/forgot-password" className="mt-4 inline-block text-sm text-primary-500 underline">Request a new link</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-shell flex min-h-screen items-center justify-center bg-blue-hero px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-3xl border border-white/60 bg-white/95 p-8 shadow-2xl shadow-black/20 backdrop-blur-2xl">
          <div className="mb-6 text-center">
            <Link href="/" className="text-xl font-extrabold tracking-tight">
              Toro<span className="text-primary-500">Pay</span>
            </Link>
            <h1 className="mt-4 text-lg font-bold">Reset your password</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="mb-1 block text-xs font-semibold text-gray-600">New password</label>
              <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-primary-500" />
              <p className="mt-1 text-xs text-gray-600">{PASSWORD_RULE_TEXT}</p>
            </div>
            <div>
              <label htmlFor="confirm-password" className="mb-1 block text-xs font-semibold text-gray-600">Confirm password</label>
              <input id="confirm-password" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-primary-500" />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {message && <p className="text-sm text-green-700">{message}</p>}

            <button type="submit" disabled={loading}
              className="w-full rounded-xl btn-blue-gradient py-3 text-sm font-semibold text-white disabled:opacity-50">
              {loading ? 'Resetting...' : 'Reset password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="auth-shell flex min-h-screen items-center justify-center bg-blue-hero px-4">
        <div className="text-sm text-gray-300">Loading...</div>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  )
}
