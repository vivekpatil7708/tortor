'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'

declare global {
  interface Window {
    google?: { accounts: { id: { initialize: (config: any) => void; renderButton: (el: HTMLElement, config: any) => void } } }
  }
}

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const router = useRouter()
  const googleBtnRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => initGoogle()
    document.head.appendChild(script)
    return () => { script.remove() }
  }, [])

  function initGoogle() {
    if (!window.google || !googleBtnRef.current) return

    window.google.accounts.id.initialize({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      callback: handleGoogleResponse,
    })

    window.google.accounts.id.renderButton(googleBtnRef.current, {
      theme: 'outline',
      size: 'large',
      width: '100%',
      text: 'signup_with',
      shape: 'rectangular',
    })
  }

  async function handleGoogleResponse(response: { credential: string }) {
    setError('')
    setGoogleLoading(true)
    try {
      const result = await api.google({ credential: response.credential })
      if (result.isNewUser) {
        router.push('/onboarding')
      } else {
        router.push('/dashboard')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-up failed')
    } finally {
      setGoogleLoading(false)
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.signup({ email, phone, password })
      router.push('/onboarding')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-white/80 bg-white/60 p-8 backdrop-blur-md">
      <div className="mb-8 text-center">
        <div className="text-2xl font-extrabold tracking-tight">Toro<span className="text-primary-500">Pay</span></div>
        <p className="mt-1 text-sm text-gray-500">Create your free account</p>
      </div>

      <div ref={googleBtnRef} className="mb-4 flex justify-center" />

      {googleLoading && <p className="mb-4 text-center text-sm text-gray-400">Signing up with Google...</p>}

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
        <div className="relative flex justify-center text-xs"><span className="bg-white/60 px-3 text-gray-400">or sign up with email</span></div>
      </div>

      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Phone</label>
          <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210"
            className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Password</label>
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary-500" />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={loading}
          className="w-full rounded-xl bg-charcoal py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account? <Link href="/login" className="font-semibold text-primary-600 hover:underline">Log in</Link>
      </p>
    </div>
  )
}
