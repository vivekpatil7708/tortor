'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, QrCode, Check } from 'lucide-react'
import { api } from '@/lib/api'

const STORAGE_KEY = 'toropay_tour_done'
const START_EVENT = 'toropay:start-tour'

const STEPS = [
  {
    href: '/dashboard/upi',
    target: 'tour-upi',
    title: 'Add your UPI ID',
    body: "This is where you add the UPI ID you'll receive payments on.",
  },
  {
    href: '/dashboard/links',
    target: 'tour-create-link',
    title: 'Create Payment Link',
    body: 'The fastest way to start accepting payments — make a link and share it.',
  },
  {
    href: '/dashboard/transactions',
    target: 'tour-transactions',
    title: 'Transactions',
    body: 'Track successful, pending, and failed payments here.',
  },
  {
    href: '/dashboard/branding',
    target: 'tour-branding',
    title: 'Branding',
    body: 'Customize your checkout with your logo and colors — revisit anytime.',
  },
]

type Target = { top: number; left: number; width: number; height: number } | null

function findTarget(selector: string): HTMLElement | null {
  return document.querySelector(`[data-tour="${selector}"]`) as HTMLElement | null
}

function measure(el: HTMLElement): Target {
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

export function OnboardingTour() {
  const router = useRouter()
  const [phase, setPhase] = useState<'hidden' | 'welcome' | 'tour'>('hidden')
  const [step, setStep] = useState(0)
  const [target, setTarget] = useState<Target>(null)

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY) === 'true'
    if (seen) return
    let mounted = true
    Promise.all([api.getUpis().catch(() => []), api.getLinks().catch(() => [])])
      .then(([upis, links]) => {
        if (mounted && upis.length === 0 && links.length === 0) setPhase('welcome')
      })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    function onStart() { startTour() }
    window.addEventListener(START_EVENT, onStart)
    return () => window.removeEventListener(START_EVENT, onStart)
  })

  function startTour() {
    setStep(0)
    setTarget(null)
    setPhase('tour')
    router.push(STEPS[0].href)
  }

  function finish() {
    localStorage.setItem(STORAGE_KEY, 'true')
    setPhase('hidden')
    router.push('/dashboard')
  }

  function go(to: number) {
    setTarget(null)
    setStep(to)
    router.push(STEPS[to].href)
  }

  useEffect(() => {
    if (phase !== 'tour') return
    let attempts = 0
    const iv = setInterval(() => {
      const el = findTarget(STEPS[step].target)
      if (el) {
        clearInterval(iv)
        el.scrollIntoView({ block: 'nearest' })
        requestAnimationFrame(() => requestAnimationFrame(() => setTarget(measure(el))))
      } else if (++attempts > 40) {
        clearInterval(iv)
      }
    }, 100)
    return () => clearInterval(iv)
  }, [phase, step])

  useEffect(() => {
    if (phase !== 'tour' || !target) return
    const remeasure = () => {
      const el = findTarget(STEPS[step].target)
      if (el) setTarget(measure(el))
    }
    window.addEventListener('resize', remeasure)
    window.addEventListener('scroll', remeasure, true)
    return () => {
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('scroll', remeasure, true)
    }
  }, [phase, step, target])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && phase !== 'hidden') finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (phase === 'hidden') return null

  if (phase === 'welcome') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-charcoal/40 p-4 backdrop-blur-[2px]">
        <div className="tour-pop w-full max-w-sm rounded-3xl border border-white/70 bg-white p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50">
            <QrCode className="h-7 w-7 text-primary-600" />
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-charcoal">Welcome to ToroPay</h2>
          <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-gray-500">
            Set up your UPI payments in a few simple steps. We&apos;ll quickly show you where everything is.
          </p>
          <div className="mt-7 space-y-2.5">
            <button onClick={startTour}
              className="w-full rounded-xl bg-charcoal px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90">
              Start Tour
            </button>
            <button onClick={finish}
              className="w-full rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-500 transition-colors hover:bg-gray-50 hover:text-charcoal">
              Skip for now
            </button>
          </div>
        </div>
      </div>
    )
  }

  const s = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-charcoal/50 backdrop-blur-[2px]" />
      {target && (
        <div
          className="tour-pop pointer-events-none fixed z-[65] rounded-2xl"
          style={{
            top: target.top - 6,
            left: target.left - 6,
            width: target.width + 12,
            height: target.height + 12,
            boxShadow: '0 0 0 4px rgba(123,184,108,0.95), 0 0 28px rgba(123,184,108,0.55)',
          }}
        />
      )}
      {target && (
        <div
          className="tour-pop fixed z-[70] w-80 max-w-[calc(100vw-24px)] rounded-2xl border border-gray-100 bg-white p-5 shadow-2xl"
          style={{
            top: target.top + target.height + 16,
            left: Math.max(12, Math.min(window.innerWidth - 320 - 12, target.left + target.width / 2 - 160)),
          }}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-extrabold tracking-tight text-charcoal">{s.title}</h3>
            <button onClick={finish} aria-label="Skip tour"
              className="text-gray-400 transition-colors hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{s.body}</p>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="mr-1 text-xs font-semibold text-gray-400">{step + 1} of {STEPS.length}</span>
              {STEPS.map((_, i) => (
                <span key={i}
                  className={`h-1.5 rounded-full transition-all ${i === step ? 'w-4 bg-primary-500' : 'w-1.5 bg-gray-200'}`} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={finish} className="text-xs font-semibold text-gray-400 transition-colors hover:text-charcoal">
                Skip
              </button>
              <button onClick={() => go(step - 1)} disabled={step === 0}
                className="rounded-lg border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none">
                Back
              </button>
              {isLast ? (
                <button onClick={finish}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary-500 px-4 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90">
                  <Check className="h-3.5 w-3.5" /> Done
                </button>
              ) : (
                <button onClick={() => go(step + 1)}
                  className="rounded-lg bg-charcoal px-4 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90">
                  Next
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
