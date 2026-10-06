'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { StatusAction } from '@/lib/transaction-actions'
import { formatAmount, formatDate } from '@/lib/utils'
import { paymentHref } from './transaction-row'

type Row = Record<string, unknown>

/**
 * The top of Overview (U13): payments waiting for you. Link payments the customer
 * marked as paid can be confirmed or rejected here; website-checkout UPI payments
 * can be confirmed (the server has no reject for those).
 */
export function NeedsAction({ linkPayments, linkTotal, checkoutPayments, onAction, onConfirmCheckout }: {
  linkPayments: Row[]
  /** Every link payment waiting, including any not listed. */
  linkTotal: number
  checkoutPayments: Row[]
  onAction: (txn: Row, status: StatusAction['status']) => void
  onConfirmCheckout: (payment: Row) => void
}) {
  const count = Math.max(linkTotal, linkPayments.length) + checkoutPayments.length
  if (count === 0) return null

  return (
    <section aria-labelledby="needs-action-title" className="mb-8 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="needs-action-title" className="font-bold text-amber-900">Needs your action ({count})</h2>
        {linkTotal > linkPayments.length && (
          <Link href="/dashboard/transactions?status=pending" className="text-sm font-semibold text-amber-900 underline">
            View all
          </Link>
        )}
      </div>
      <p className="mt-1 text-sm text-amber-900/80">Customers say they paid. Check your bank or UPI app, then confirm or reject.</p>

      <ul className="mt-3 space-y-2">
        {linkPayments.map(t => (
          <li key={t.id as string} className="rounded-xl border border-amber-200/70 bg-white/80 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={paymentHref(t)} className="text-sm font-semibold hover:underline">
                  {(t.customer_name as string) || 'A customer'}
                </Link>
                <p className="text-xs text-gray-500">
                  {(t.customer_phone as string) ? `${t.customer_phone as string} · ` : ''}{formatDate(t.created_at as string)}
                </p>
              </div>
              <p className="shrink-0 text-sm font-bold">{formatAmount(Number(t.amount))}</p>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onAction(t, 'success')}>Confirm</Button>
              <Button size="sm" variant="danger" onClick={() => onAction(t, 'failed')}>Reject</Button>
            </div>
          </li>
        ))}
        {checkoutPayments.map(p => (
          <li key={p.id as string} className="rounded-xl border border-amber-200/70 bg-white/80 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold">{p.payment_reference as string}</p>
                <p className="text-xs text-gray-500">
                  Website order{p.order_number ? ` ${p.order_number as string}` : ''} · {formatDate(p.created_at as string)}
                </p>
              </div>
              <p className="shrink-0 text-sm font-bold">{formatAmount(Number(p.amount))}</p>
            </div>
            <div className="mt-2">
              <Button size="sm" onClick={() => onConfirmCheckout(p)}>Confirm paid</Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
