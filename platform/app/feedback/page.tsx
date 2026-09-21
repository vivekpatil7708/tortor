'use client'

import { useState } from 'react'

const USEFUL_PARTS = [
  'Creating payment links',
  'Sharing payment links with customers',
  'Tracking payments',
  'Payment reminders',
  'Dashboard and reporting',
  'Customer support',
  'Other',
]

const COLLECTING_OPTIONS = ['Yes, significantly', 'Yes, somewhat', 'No major difference', 'No, it has not']

export default function FeedbackPage() {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const [merchantName, setMerchantName] = useState('')
  const [satisfaction, setSatisfaction] = useState<number | null>(null)
  const [easeOfUse, setEaseOfUse] = useState<number | null>(null)
  const [usefulParts, setUsefulParts] = useState<string[]>([])
  const [easeCollecting, setEaseCollecting] = useState('')
  const [likesMost, setLikesMost] = useState('')
  const [issues, setIssues] = useState('')
  const [improvement, setImprovement] = useState('')
  const [npsScore, setNpsScore] = useState<number | null>(null)
  const [followUp, setFollowUp] = useState<boolean | null>(null)
  const [contact, setContact] = useState('')

  function togglePart(part: string) {
    setUsefulParts(prev => (prev.includes(part) ? prev.filter(p => p !== part) : [...prev, part]))
  }

  function validate() {
    if (!merchantName.trim()) return 'Please enter your business name.'
    if (satisfaction === null) return 'Please rate your overall satisfaction.'
    if (easeOfUse === null) return 'Please rate how easy ToroPay is to use.'
    if (!easeCollecting) return 'Please answer whether ToroPay made collecting payments easier.'
    if (npsScore === null) return 'Please rate how likely you are to recommend ToroPay.'
    if (followUp === null) return 'Please answer whether we can follow up with you.'
    if (followUp && !contact.trim()) return 'Please provide an email or phone number for follow-up.'
    return null
  }

  async function handleSubmit() {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantName,
          satisfaction,
          easeOfUse,
          usefulParts,
          easeCollecting,
          likesMost,
          issues,
          improvement,
          npsScore,
          followUp,
          contact: followUp ? contact : '',
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Something went wrong. Please try again.')
      }
      setSubmitted(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#f5f0eb] px-4 py-10">
        <div className="mx-auto w-full max-w-md rounded-2xl border border-white/70 bg-white p-8 text-center shadow-sm">
          <span className="text-lg font-extrabold tracking-tight">
            Toro<span className="text-[#7bb86c]">Pay</span>
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Thank you for your feedback.</h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-500">
            Your response will help us build a better ToroPay experience for your business.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f0eb] px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <span className="text-lg font-extrabold tracking-tight">
          Toro<span className="text-[#7bb86c]">Pay</span>
        </span>
        <div className="mt-4 rounded-2xl border border-white/70 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-xl font-bold tracking-tight">Help Us Improve ToroPay</h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            Your feedback helps us make ToroPay faster, simpler, and more useful for your business. This form takes about 2 minutes to complete.
          </p>

          <div className="mt-6 space-y-6">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                Business/merchant name <span className="text-red-500">*</span>
              </label>
              <input
                value={merchantName}
                onChange={e => setMerchantName(e.target.value)}
                placeholder="e.g. My Store"
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7bb86c]"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-gray-600">
                How satisfied are you with ToroPay overall? <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center justify-between gap-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setSatisfaction(n)}
                    className={`flex-1 rounded-xl border px-2 py-3 text-center text-sm font-semibold transition-colors ${satisfaction === n ? 'border-[#7bb86c] bg-[#7bb86c] text-white' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}>
                    {n}
                  </button>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-gray-400">
                <span>1 · Very dissatisfied</span><span>5 · Very satisfied</span>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-gray-600">
                How easy is ToroPay to use? <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center justify-between gap-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setEaseOfUse(n)}
                    className={`flex-1 rounded-xl border px-2 py-3 text-center text-sm font-semibold transition-colors ${easeOfUse === n ? 'border-[#7bb86c] bg-[#7bb86c] text-white' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}>
                    {n}
                  </button>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-gray-400">
                <span>1 · Very difficult</span><span>5 · Very easy</span>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-gray-600">
                Which parts of ToroPay do you find most useful?
              </label>
              <div className="space-y-1.5">
                {USEFUL_PARTS.map(part => (
                  <button key={part} onClick={() => togglePart(part)}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-2.5 text-left text-sm transition-colors ${usefulParts.includes(part) ? 'border-[#7bb86c] bg-[#7bb86c]/10 font-medium text-gray-800' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}>
                    <span>{part}</span>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs ${usefulParts.includes(part) ? 'border-[#7bb86c] bg-[#7bb86c] text-white' : 'border-gray-300 bg-white text-transparent'}`}>✓</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-gray-600">
                Has ToroPay made collecting payments easier for your business? <span className="text-red-500">*</span>
              </label>
              <div className="space-y-1.5">
                {COLLECTING_OPTIONS.map(opt => (
                  <button key={opt} onClick={() => setEaseCollecting(opt)}
                    className={`block w-full rounded-xl border px-4 py-2.5 text-left text-sm transition-colors ${easeCollecting === opt ? 'border-[#7bb86c] bg-[#7bb86c]/10 font-medium text-gray-800' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">What do you like most about ToroPay?</label>
              <textarea value={likesMost} onChange={e => setLikesMost(e.target.value)} rows={3}
                className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7bb86c]" />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Have you faced any issues or difficulties while using ToroPay?</label>
              <textarea value={issues} onChange={e => setIssues(e.target.value)} rows={3}
                className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7bb86c]" />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">What is the one improvement or feature you would most like ToroPay to add?</label>
              <textarea value={improvement} onChange={e => setImprovement(e.target.value)} rows={3}
                className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7bb86c]" />
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-gray-600">
                How likely are you to recommend ToroPay to another business owner? <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                  <button key={n} onClick={() => setNpsScore(n)}
                    className={`rounded-lg border px-2 py-2 text-center text-xs font-semibold transition-colors ${npsScore === n ? 'border-[#7bb86c] bg-[#7bb86c] text-white' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}>
                    {n}
                  </button>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-gray-400">
                <span>0 · Not at all likely</span><span>10 · Extremely likely</span>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-gray-600">
                Would you be open to a short follow-up conversation with the ToroPay team?
              </label>
              <div className="flex gap-2">
                {[{ value: true, label: 'Yes' }, { value: false, label: 'No' }].map(opt => (
                  <button key={opt.label} onClick={() => setFollowUp(opt.value)}
                    className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${followUp === opt.value ? 'border-[#7bb86c] bg-[#7bb86c] text-white' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {followUp === true && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                  Email address or phone number for follow-up <span className="text-red-500">*</span>
                </label>
                <input
                  value={contact}
                  onChange={e => setContact(e.target.value)}
                  placeholder="you@business.com or +91..."
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7bb86c]"
                />
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
            )}

            <button onClick={handleSubmit} disabled={submitting}
              className="w-full rounded-xl bg-[#7bb86c] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-gray-400">Powered by ToroPay</p>
      </div>
    </div>
  )
}