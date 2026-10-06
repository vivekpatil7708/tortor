// Payment statuses in plain words, the same on every dashboard page (U18). The
// database keeps its own values: initiated, pending, success, failed.
import { CHECKOUT_HOLD_MINUTES } from './link-uses'

export type PaymentStatusView = {
  /** What the merchant reads, e.g. "Customer says paid". */
  label: string
  /** Badge colours. */
  tone: string
  /** One line on what happens next, for the payment's own page. */
  nextStep: string
}

const VIEWS = {
  started: {
    label: 'Started', tone: 'bg-sky-50 text-sky-700',
    nextStep: "The customer opened the payment but hasn't said they paid. If the money reached you anyway, you can still confirm it.",
  },
  abandoned: {
    label: 'Abandoned', tone: 'bg-gray-100 text-gray-600',
    nextStep: `The customer started but didn't finish within ${CHECKOUT_HOLD_MINUTES} minutes. If the money reached you anyway, you can still confirm it.`,
  },
  pending: {
    label: 'Customer says paid', tone: 'bg-amber-50 text-amber-800',
    nextStep: 'The customer says they paid. Check your bank or UPI app, then confirm or reject.',
  },
  success: { label: 'Paid', tone: 'bg-green-50 text-green-700', nextStep: 'You confirmed this payment.' },
  failed: { label: 'Rejected', tone: 'bg-red-50 text-red-700', nextStep: 'You marked this payment as not received.' },
} satisfies Record<string, PaymentStatusView>

/**
 * How a payment's status reads on the dashboard. A checkout started more than
 * 30 minutes ago without "I've paid" is abandoned, as in Analytics.
 */
export function paymentStatus(status: string, createdAt?: string | Date | null, now = Date.now()): PaymentStatusView {
  if (status === 'initiated') {
    const started = createdAt ? new Date(createdAt).getTime() : Number.NaN
    return now - started > CHECKOUT_HOLD_MINUTES * 60_000 ? VIEWS.abandoned : VIEWS.started
  }
  if (status === 'pending' || status === 'success' || status === 'failed') return VIEWS[status]
  return { label: status, tone: 'bg-gray-100 text-gray-600', nextStep: '' }
}

/** The Transactions filter tabs. "Started" includes abandoned checkouts. */
export const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Customer says paid' },
  { value: 'success', label: 'Paid' },
  { value: 'initiated', label: 'Started' },
  { value: 'failed', label: 'Rejected' },
] as const
