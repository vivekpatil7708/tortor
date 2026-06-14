'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [businessName, setBusinessName] = useState('')
  const [vpa, setVpa] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.me().then(({ merchant }) => {
      if (merchant?.onboarding_complete) router.push('/dashboard')
      if (merchant?.business_name) setBusinessName(merchant.business_name as string)
    }).catch(() => router.push('/login'))
  }, [router])

  async function saveBusiness() {
    if (!businessName.trim()) { setError('Business name is required'); return }
    setLoading(true)
    try {
      await api.updateMerchant({ business_name: businessName })
      setError('')
      setStep(2)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  async function addUpiAndFinish() {
    if (!vpa.includes('@')) { setError('Enter a valid UPI ID (e.g. shop@paytm)'); return }
    setLoading(true)
    try {
      await api.addUpi(vpa)
      await api.completeOnboarding()
      router.push('/dashboard/links/new')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-cream to-beige px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/80 bg-white/60 p-8 backdrop-blur-md">
        <div className="mb-6 text-center">
          <div className="text-2xl font-extrabold">Toro<span className="text-primary-500">Pay</span></div>
          <p className="mt-1 text-sm text-gray-500">Set up your account — step {step} of 2</p>
        </div>

        {step === 1 ? (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Business Name</label>
              <input value={businessName} onChange={e => setBusinessName(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none" />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button onClick={saveBusiness} disabled={loading} className="w-full">
              {loading ? 'Saving...' : 'Continue'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Your UPI ID (VPA)</label>
              <input value={vpa} onChange={e => setVpa(e.target.value)} placeholder="yourshop@paytm"
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none" />
              <p className="mt-1 text-xs text-gray-400">Payments go directly to this UPI ID.</p>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button onClick={addUpiAndFinish} disabled={loading} className="w-full">
              {loading ? 'Setting up...' : 'Finish & create first link'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
