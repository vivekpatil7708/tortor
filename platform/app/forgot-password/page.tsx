'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const COOLDOWN = 60

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown(c => c - 1), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong')
      } else {
        setMessage(data.message || 'Check your email for the reset link.')
        setCooldown(COOLDOWN)
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell flex min-h-screen items-center justify-center bg-blue-hero px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-3xl border border-white/60 bg-white/95 p-8 shadow-2xl shadow-black/20 backdrop-blur-2xl">
          <div className="mb-6 text-center">
            <Link href="/" className="text-xl font-extrabold tracking-tight">
              Toro<span className="text-primary-500">Pay</span>
            </Link>
            <h1 className="mt-4 text-lg font-bold">Forgot password</h1>
            <p className="mt-1 text-sm text-gray-600">Enter your email to receive a reset link</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-xs font-semibold text-gray-600">Email</label>
              <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-primary-500" />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {message && <p className="text-sm text-green-700">{message}</p>}

            <button type="submit" disabled={loading || cooldown > 0}
              className="w-full rounded-xl btn-blue-gradient py-3 text-sm font-semibold text-white disabled:opacity-50">
              {loading ? 'Sending...' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Send reset link'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link href="/login" className="text-sm text-gray-600 hover:text-charcoal">Back to login</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
