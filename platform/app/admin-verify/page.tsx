'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function AdminVerifyPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/admin/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Verification failed')
        return
      }
      router.push('/admin')
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-cream to-beige px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-3xl border border-white/60 bg-white/40 p-8 backdrop-blur-xl">
          <div className="mb-6 text-center">
            <span className="text-xl font-extrabold tracking-tight">
              Toro<span className="text-primary-500">Pay</span>
            </span>
            <h1 className="mt-4 text-lg font-bold">Admin verification</h1>
            <p className="mt-1 text-sm text-gray-500">Enter the 6-digit code from your authenticator app</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              required
              className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-center font-mono text-lg tracking-widest outline-none focus:border-primary-500"
            />

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button type="submit" disabled={loading || code.length !== 6}
              className="w-full rounded-xl bg-charcoal py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {loading ? 'Checking...' : 'Verify'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link href="/dashboard" className="text-sm text-gray-500 hover:text-charcoal">Back to dashboard</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
