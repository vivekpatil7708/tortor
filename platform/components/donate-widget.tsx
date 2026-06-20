'use client'

import { useEffect, useState } from 'react'

const UPI_ID = '9172632189@kotakbank'

const UPI_APPS = [
  { name: 'Google Pay', id: 'gpay', pkg: 'com.google.android.apps.nbu.paisa.user' },
  { name: 'PhonePe', id: 'phonepe', pkg: 'com.phonepe.app' },
  { name: 'Paytm', id: 'paytm', pkg: 'net.one97.paytm' },
  { name: 'Amazon Pay', id: 'amazon', pkg: 'in.amazon.mShop.android.shopping' },
  { name: 'CRED', id: 'cred', pkg: 'com.dreamplug.androidapp' },
  { name: 'BHIM', id: 'bhim', pkg: 'in.org.npci.upiapp' },
]

export default function DonateWidget({ initialAmount }: { initialAmount?: number | null }) {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(initialAmount ?? null)
  const [customMode, setCustomMode] = useState(false)
  const [customInput, setCustomInput] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (initialAmount != null) setSelectedAmount(initialAmount)
  }, [initialAmount])

  function buildUpiUrl(amount?: number) {
    const params = new URLSearchParams({ pa: UPI_ID, pn: 'ToroPay', cu: 'INR' })
    if (amount) params.set('am', String(amount))
    return `upi://pay?${params.toString()}`
  }

  function buildAppLink(pkg: string, amount?: number) {
    const am = amount ? `&am=${amount}` : ''
    return `intent://pay?pa=${UPI_ID}&pn=ToroPay${am}&cu=INR#Intent;scheme=upi;package=${pkg};end`
  }

  function handleAmountClick(amt: number) {
    setSelectedAmount(amt)
    setCustomMode(false)
    setCustomInput('')
  }

  async function copyUpiId() {
    try {
      await navigator.clipboard.writeText(UPI_ID)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = UPI_ID
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const qrSrc = selectedAmount
    ? `/api/qr?vpa=${encodeURIComponent(UPI_ID)}&amount=${selectedAmount}&txn_id=donate_${Date.now()}`
    : null

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Donate via UPI</p>

      <div className="mt-3 flex items-center justify-center gap-2">
        <span className="font-mono text-base font-bold text-charcoal sm:text-lg">{UPI_ID}</span>
        <button onClick={copyUpiId}
          className="rounded-lg bg-charcoal/10 px-3 py-1.5 text-xs font-semibold text-charcoal transition-colors hover:bg-charcoal/20">
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {[10, 50, 100].map(amt => (
          <button key={amt} onClick={() => handleAmountClick(amt)}
            className={`min-w-[5rem] rounded-xl px-6 py-3 text-sm font-semibold transition-all ${
              selectedAmount === amt
                ? 'bg-primary-500 text-white shadow-lg'
                : 'bg-charcoal text-white hover:opacity-90'
            }`}>
            {'\u20B9'}{amt}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        <button onClick={() => setCustomMode(!customMode)}
          className="rounded-xl border border-gray-200 bg-white/60 px-6 py-3 text-sm font-semibold text-charcoal transition-colors hover:bg-white">
          {customMode ? 'Cancel' : 'Custom amount'}
        </button>
        {customMode && (
          <div className="flex gap-2">
            <input type="number" min="1" placeholder="Enter amount"
              value={customInput} onChange={e => { setCustomInput(e.target.value); setSelectedAmount(Number(e.target.value) || null) }}
              className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary-500" />
          </div>
        )}
      </div>

      {selectedAmount && (
        <div className="mt-6 space-y-4 rounded-xl border border-gray-200 bg-white/60 p-5 backdrop-blur-sm">
          {qrSrc && (
            <div className="flex flex-col items-center gap-2">
              <img src={qrSrc} alt="UPI QR Code" className="h-44 w-44 rounded-xl bg-white p-2 shadow-sm" />
              <p className="text-xs text-gray-400">Scan with any UPI app</p>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold text-gray-500">Pay with app</p>
            <div className="flex flex-wrap justify-center gap-2">
              {UPI_APPS.map(app => (
                <a key={app.id} href={buildAppLink(app.pkg, selectedAmount)}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-charcoal shadow-sm transition-colors hover:bg-gray-50">
                  {app.name}
                </a>
              ))}
              <a href={buildUpiUrl(selectedAmount)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-charcoal shadow-sm transition-colors hover:bg-gray-50">
                Other UPI app
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
