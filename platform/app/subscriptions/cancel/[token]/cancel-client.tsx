'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

export default function CancelClient({
  token,
  business,
  alreadyCancelled,
}: {
  token: string
  business: string
  alreadyCancelled: boolean
}) {
  const [cancelled, setCancelled] = useState(alreadyCancelled)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function cancel() {
    if (busy || cancelled) return
    setBusy(true)
    setError('')
    try {
      await api.cancelSubscriptionByToken(token)
      setCancelled(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel the subscription. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (cancelled) {
    return (
      <p role="status" className="mt-5 rounded-2xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
        This subscription is cancelled. {business} will not send any more payment links for it.
      </p>
    )
  }

  return (
    <div className="mt-5 space-y-2">
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <Button type="button" variant="danger" className="w-full" onClick={cancel} disabled={busy}>
        {busy ? 'Cancelling…' : 'Cancel subscription'}
      </Button>
      <p className="text-center text-xs text-gray-400">
        This only stops future payments. It does not refund past payments.
      </p>
    </div>
  )
}
