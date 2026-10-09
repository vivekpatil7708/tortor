'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { MoreHorizontal, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { paymentStatus } from '@/lib/payment-status'
import { canSettle, canUndo, type StatusAction } from '@/lib/transaction-actions'
import { formatAmount, formatDate } from '@/lib/utils'

type Txn = Record<string, unknown>
type OnAction = (txn: Txn, status: StatusAction['status'], undo?: boolean) => void

export const paymentHref = (txn: Txn) => `/dashboard/transactions/${encodeURIComponent(txn.txn_id as string)}`

export function StatusBadge({ txn, now }: { txn: Txn; now?: number }) {
  const view = paymentStatus(txn.status as string, txn.created_at as string, now)
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${view.tone}`}>{view.label}</span>
}

const sendButton = 'inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-charcoal hover:bg-gray-50'

/**
 * One payment in the Transactions list: who, how much, its status in plain words,
 * and what you can do. Confirm and Reject lead only when the customer says they
 * paid; for a checkout that was only started they wait under "More".
 */
export function TransactionRow({ txn, onAction, onSend, now, children }: {
  txn: Txn
  onAction: OnAction
  onSend: (txn: Txn) => void
  now?: number
  /** Order details (products, custom fields, note). */
  children?: ReactNode
}) {
  const [more, setMore] = useState(false)
  const txnId = txn.txn_id as string

  return (
    <div className="rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={paymentHref(txn)} className="text-sm font-bold hover:underline">
              {(txn.customer_name as string) || 'Anonymous'}
            </Link>
            <StatusBadge txn={txn} now={now} />
          </div>
          <p className="mt-1 text-xs text-gray-500">{(txn.customer_phone as string) || 'No phone'}</p>
          <p className="mt-0.5 break-words text-xs text-gray-500">{txnId} · {formatDate(txn.created_at as string)}</p>
        </div>
        <p className="shrink-0 text-sm font-bold">{formatAmount(Number(txn.amount))}</p>
      </div>

      {/* Its own row, which wraps on phones so no button is cut off. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {txn.status === 'pending' && (
          <>
            <Button size="sm" onClick={() => onAction(txn, 'success')}>Confirm</Button>
            <Button size="sm" variant="danger" onClick={() => onAction(txn, 'failed')}>Reject</Button>
          </>
        )}
        {txn.status === 'initiated' && (more ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => onAction(txn, 'success')}>Confirm</Button>
            <Button size="sm" variant="secondary" onClick={() => onAction(txn, 'failed')}>Reject</Button>
          </>
        ) : (
          <button type="button" onClick={() => setMore(true)} aria-expanded="false" className={`${sendButton} text-gray-600`}>
            <MoreHorizontal className="h-3.5 w-3.5" aria-hidden /> More
          </button>
        ))}
        {txn.status === 'success' && (
          <button type="button" onClick={() => onSend(txn)} className={sendButton}>
            <Send className="h-3 w-3" aria-hidden /> Send receipt
          </button>
        )}
        {canUndo(txn, now) && (
          <Button size="sm" variant="danger" onClick={() => onAction(txn, 'failed', true)}>Undo</Button>
        )}
        <Link href={paymentHref(txn)} className="ml-auto text-xs font-semibold text-gray-500 hover:text-charcoal">
          Open
        </Link>
      </div>
      {children}
    </div>
  )
}

/** The payment page's "what next" box: the status in plain words and the actions that apply. */
export function NextStepCard({ txn, onAction, onSend, now }: {
  txn: Txn
  onAction: OnAction
  onSend: () => void
  now?: number
}) {
  const view = paymentStatus(txn.status as string, txn.created_at as string, now)
  const undo = canUndo(txn, now)
  return (
    <div className="mb-6 rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-gray-700">What&apos;s next</h2>
        <StatusBadge txn={txn} now={now} />
      </div>
      {view.nextStep && <p className="mt-2 text-sm text-gray-600">{view.nextStep}</p>}
      {(canSettle(txn) || undo || txn.status === 'success') && (
        <div className="mt-3 flex flex-wrap gap-2">
          {canSettle(txn) && (
            <>
              <Button size="sm" onClick={() => onAction(txn, 'success')}>Confirm payment</Button>
              <Button size="sm" variant="danger" onClick={() => onAction(txn, 'failed')}>Reject</Button>
            </>
          )}
          {undo && <Button size="sm" variant="danger" onClick={() => onAction(txn, 'failed', true)}>Undo confirmation</Button>}
          {txn.status === 'success' && (
            <button type="button" onClick={onSend} className={sendButton}>
              <Send className="h-3 w-3" aria-hidden /> Send receipt
            </button>
          )}
        </div>
      )}
    </div>
  )
}
