import type { PaymentStatus } from '@prisma/client'

/**
 * Which payment status changes are allowed. A payment never silently goes
 * backwards: late or out-of-order provider messages are ignored, and a
 * merchant can only undo a confirmation shortly after making it.
 */

export type TransitionDecision =
  | { action: 'apply' }
  | { action: 'unchanged' }
  | { action: 'blocked'; reason: string }

const APPLY: TransitionDecision = { action: 'apply' }
const UNCHANGED: TransitionDecision = { action: 'unchanged' }
const blocked = (reason: string): TransitionDecision => ({ action: 'blocked', reason })

/** How long a merchant can undo "I received it" on a payment-link payment. */
export const CONFIRM_UNDO_MINUTES = 30

export type LinkPaymentStatus = 'pending' | 'success' | 'failed'

/**
 * Payment-link transactions: initiated → pending (the customer says they paid)
 * → success or failed (the merchant decides). Failed can still become success
 * when the money arrives late.
 */
export function decideLinkPaymentChange(params: {
  from: string
  to: LinkPaymentStatus
  by: 'customer' | 'merchant'
  confirmedAt?: Date | null
  now?: number
}): TransitionDecision {
  const { from, to, by, confirmedAt, now = Date.now() } = params
  if (from === to) return UNCHANGED

  if (to === 'pending') {
    return from === 'initiated' ? APPLY : blocked('Transaction already finalized')
  }
  if (by !== 'merchant') return blocked('Only the merchant can settle a payment')
  if (to === 'success' || from !== 'success') return APPLY

  // Success → failed: only as an undo, shortly after confirming.
  const undoUntil = confirmedAt ? confirmedAt.getTime() + CONFIRM_UNDO_MINUTES * 60_000 : 0
  return now <= undoUntil
    ? APPLY
    : blocked(`A confirmed payment can only be undone within ${CONFIRM_UNDO_MINUTES} minutes of confirming it`)
}

/** Where a provider payment may move next. */
const NEXT_PAYMENT_STATUS: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ['processing', 'paid', 'failed', 'expired'],
  processing: ['paid', 'failed', 'expired'],
  failed: ['paid'],
  expired: ['paid'],
  paid: ['partially_refunded', 'refunded', 'disputed'],
  partially_refunded: ['refunded', 'disputed'],
  disputed: ['paid', 'refunded'],
  refunded: [],
}

/** Provider payments (website checkout, Razorpay, Cashfree): paid only moves on to refund or dispute. */
export function decidePaymentStatusChange(from: PaymentStatus, to: PaymentStatus): TransitionDecision {
  if (from === to) return UNCHANGED
  return NEXT_PAYMENT_STATUS[from]?.includes(to) ? APPLY : blocked(`A ${from} payment can't change to ${to}`)
}
