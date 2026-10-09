'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { api } from '@/lib/api'
import { PASSWORD_RULE_TEXT, passwordProblem } from '@/lib/password-policy'

declare global {
  interface Window {
    google?: { accounts: { id: { initialize: (config: any) => void; renderButton: (el: HTMLElement, config: any) => void } } }
  }
}

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
      text: 'continue_with',
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
    const problem = passwordProblem(password)
    if (problem) {
      setError(problem)
      return
    }
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

      {googleLoading && <p className="mb-4 text-center text-sm text-gray-500">Signing up with Google...</p>}

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
        <div className="relative flex justify-center text-xs"><span className="bg-white/60 px-3 text-gray-500">or sign up with email</span></div>
      </div>

      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-semibold text-gray-500">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary-500" />
        </div>
        <div>
          <label htmlFor="phone" className="mb-1 block text-xs font-semibold text-gray-500">Phone</label>
          <input id="phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210"
            className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary-500" />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="password" className="block text-xs font-semibold text-gray-500">Password</label>
            <button type="button" onClick={() => setShowPassword(s => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-charcoal">
              {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <input id="password" type={showPassword ? 'text' : 'password'} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary-500" />
          <p className="mt-1 text-xs text-gray-500">{PASSWORD_RULE_TEXT}</p>
        </div>
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={loading}
          className="w-full rounded-xl bg-charcoal py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-gray-500">
        By creating an account you agree to the {' '}
        <Link href="/terms" className="font-semibold text-primary-600 hover:underline">Terms of Service</Link> and{' '}
        <Link href="/privacy" className="font-semibold text-primary-600 hover:underline">Privacy Policy</Link>.
      </p>
      <p className="mt-3 text-center text-sm text-gray-500">
        Already have an account? <Link href="/login" className="font-semibold text-primary-600 hover:underline">Log in</Link>
      </p>
    </div>
  )
}
