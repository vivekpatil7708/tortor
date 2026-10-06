// Confirm, Reject and Undo on the dashboard: when each is offered, and what the
// confirmation box says. The server checks every change again (lib/payment-transitions.ts).
import { CONFIRM_UNDO_MINUTES } from './payment-transitions'
import { formatAmount } from './utils'

type Txn = Record<string, unknown>

export type StatusAction = { txn: Txn; status: 'success' | 'failed'; undo?: boolean }

/** Confirm and Reject apply while a payment is open: the customer said they paid, or only started. */
export function canSettle(txn: Txn): boolean {
  return txn.status === 'pending' || txn.status === 'initiated'
}

/** A confirmation can be undone for a short while, in case it was a mistake. */
export function canUndo(txn: Txn, now = Date.now()): boolean {
  if (txn.status !== 'success' || !txn.confirmed_at) return false
  return now - new Date(txn.confirmed_at as string).getTime() < CONFIRM_UNDO_MINUTES * 60_000
}

export function actionTitle({ status, undo }: StatusAction): string {
  if (undo) return 'Undo confirmation?'
  return status === 'success' ? 'Confirm payment?' : 'Reject payment?'
}

export function actionConfirmLabel({ status, undo }: StatusAction): string {
  if (undo) return 'Undo confirmation'
  return status === 'success' ? 'Yes, I received it' : 'Reject payment'
}

export function actionMessage({ txn, status, undo }: StatusAction): string {
  const amount = formatAmount(Number(txn.amount))
  const customer = (txn.customer_name as string) || 'this customer'
  if (undo) {
    return `Mark ${amount} from ${customer} as not received? Use this only if you confirmed it by mistake. If this link sends updates to your website, it will be told the payment failed.`
  }
  if (status === 'failed') {
    return `Mark ${amount} from ${customer} as failed? Do this only if the money did not arrive.`
  }
  const notDeclared = txn.status === 'initiated'
    ? ' The customer has NOT marked this payment as sent.'
    : ''
  return `Only confirm if ${amount} from ${customer} has reached your bank or UPI app.${notDeclared}`
}
