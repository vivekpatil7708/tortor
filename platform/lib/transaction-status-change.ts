import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { decideLinkPaymentChange, type LinkPaymentStatus } from '@/lib/payment-transitions'
import { queuePaidClaimAlert } from '@/lib/payment-alerts'
import { queueTransactionSheetExport } from '@/lib/google-sheets/service'
import { notifyPaymentStatus } from '@/lib/webhooks'
import { syncSubscriptionPaymentFromTransaction } from '@/lib/subscription-payments'
import { awardLoyaltyPointsForTransaction, reverseLoyaltyPointsForTransaction } from '@/lib/loyalty'
import type { Transaction } from '@prisma/client'

// Applying a payment-link transaction's status change, shared by the dashboard
// route (PATCH /api/transactions/[txnId]) and the public v1 API
// (POST /api/v1/transactions/{id}/confirm and .../reject). The transition rules,
// optimistic locking, audit entry, webhook and merchant alert all live here so
// the two entry points can never disagree.

export type StatusChangePaymentDetails = {
  paymentApp?: string | null
  payerVpa?: string | null
  upiTxnId?: string | null
}

export type StatusChangeResult =
  /** Same status again (a repeat confirm, or a customer tapping "I've paid" twice). */
  | { outcome: 'unchanged'; transaction: Transaction }
  /** The transition isn't allowed (e.g. undoing a confirmation after 30 minutes). */
  | { outcome: 'blocked'; reason: string }
  /** Somebody changed the transaction since it was read; retry from a fresh read. */
  | { outcome: 'conflict'; reason: string }
  | { outcome: 'applied'; transaction: Transaction; redirectUrl: string | null }

/**
 * Move a transaction to `to` (or record payment details when `to` is omitted).
 * `txn` must already belong to the acting merchant. Status changes use an
 * optimistic lock on the status that was read, so two clicks at once can't both win.
 */
export async function changeTransactionStatus(params: {
  txn: Transaction
  to?: LinkPaymentStatus
  by: 'customer' | 'merchant'
  paymentDetails?: StatusChangePaymentDetails
}): Promise<StatusChangeResult> {
  const { txn, to, by, paymentDetails } = params

  // Paid stays paid (except a quick undo), and nothing goes back to pending.
  const decision = to
    ? decideLinkPaymentChange({ from: txn.status, to, by, confirmedAt: txn.confirmedAt })
    : { action: 'unchanged' as const }
  if (decision.action === 'blocked') return { outcome: 'blocked', reason: decision.reason }
  const statusChanges = decision.action === 'apply' && to !== undefined

  // Payment details (app, payer UPI ID, UTR) can only be recorded by the merchant.
  const detailsGiven = by === 'merchant' && !!paymentDetails &&
    [paymentDetails.paymentApp, paymentDetails.payerVpa, paymentDetails.upiTxnId].some(v => v !== undefined)

  if (!statusChanges && !detailsGiven) return { outcome: 'unchanged', transaction: txn }

  const appliedDetails = detailsGiven
    ? {
        paymentApp: paymentDetails!.paymentApp ?? txn.paymentApp,
        payerVpa: paymentDetails!.payerVpa ?? txn.payerVpa,
        upiTxnId: paymentDetails!.upiTxnId ?? txn.upiTxnId,
      }
    : {}

  const now = new Date()
  const isUndo = statusChanges && to === 'failed' && txn.status === 'success'
  const statusFields = !statusChanges
    ? {}
    : to === 'success'
      ? { status: 'success', settlementStatus: 'settled', settlementAmount: txn.amount, settlementDate: now, confirmedAt: now }
      : to === 'pending'
        ? { status: 'pending', confirmedAt: now }
        : { status: 'failed', ...(isUndo ? { settlementStatus: 'pending', settlementAmount: null, settlementDate: null } : {}) }

  // Only applies if nobody changed the status since we read it, so two
  // clicks or tabs at once can't both win.
  const result = await prisma.transaction.updateMany({
    where: { txnId: txn.txnId, status: txn.status },
    data: { ...statusFields, ...appliedDetails },
  })
  if (result.count === 0) {
    return { outcome: 'conflict', reason: 'This payment was just updated. Refresh and try again.' }
  }
  const updated = await prisma.transaction.findUniqueOrThrow({ where: { txnId: txn.txnId } })

  if (isUndo) {
    await logAudit({
      merchantId: txn.merchantId,
      action: 'payment_confirmation_undone',
      entityType: 'transaction',
      entityId: txn.id,
      metadata: { txn_id: txn.txnId, amount: txn.amount, confirmed_at: txn.confirmedAt?.toISOString() ?? null },
    })
  }

  // Settings -> Google Sheets: add newly confirmed payments after the response.
  // The queue never throws, so a Google outage cannot fail the confirmation.
  if (statusChanges && to === 'success') {
    queueTransactionSheetExport(updated.merchantId, updated.id)
  }

  if (statusChanges && to) {
    // A subscription payment is identified by its one-time link. This is
    // best-effort: the payment itself has already been confirmed.
    await syncSubscriptionPaymentFromTransaction(updated, to).catch(err => {
      console.error('Could not update the subscription payment:', err)
    })
    if (to === 'success') {
      await awardLoyaltyPointsForTransaction(updated).catch(err => {
        console.error('Could not award loyalty points:', err)
      })
    }
    if (isUndo) {
      await reverseLoyaltyPointsForTransaction(updated.id).catch(err => {
        console.error('Could not reverse loyalty points:', err)
      })
    }
    await notifyPaymentStatus(updated.id, to)
  }

  // Settings → Notifications: email the merchant that a customer says they've paid.
  if (statusChanges && to === 'pending' && by === 'customer') {
    queuePaidClaimAlert(updated)
  }

  const link = statusChanges && to === 'success' && updated.paymentLinkId
    ? await prisma.paymentLink.findUnique({ where: { id: updated.paymentLinkId } })
    : null

  return { outcome: 'applied', transaction: updated, redirectUrl: statusChanges && to === 'success' ? link?.redirectUrl ?? null : null }
}
