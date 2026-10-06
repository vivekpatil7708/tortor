'use client'

import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { actionConfirmLabel, actionMessage, actionTitle, type StatusAction } from '@/lib/transaction-actions'

type Txn = Record<string, unknown>

/**
 * Confirm / Reject / Undo for one payment at a time, the same on every page: asks
 * first, then saves through the checked server route. `onDone` gets the updated payment.
 */
export function useStatusAction(onDone: (txn: Txn) => void) {
  const [pending, setPending] = useState<StatusAction | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function ask(txn: Txn, status: StatusAction['status'], undo = false) {
    setError('')
    setPending({ txn, status, undo })
  }

  async function apply() {
    if (!pending || busy) return
    setBusy(true)
    setError('')
    try {
      const { transaction } = await api.updateTransaction(pending.txn.txn_id as string, { status: pending.status, merchant_action: true })
      setPending(null)
      onDone(transaction)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the payment')
    } finally {
      setBusy(false)
    }
  }

  const dialog = pending ? (
    <ConfirmDialog
      open
      onClose={() => { if (!busy) setPending(null) }}
      onConfirm={apply}
      title={actionTitle(pending)}
      message={actionMessage(pending) + (error ? ` Error: ${error}` : '')}
      confirmLabel={actionConfirmLabel(pending)}
      danger={pending.status === 'failed'}
      busy={busy}
    />
  ) : null

  return { ask, dialog }
}
