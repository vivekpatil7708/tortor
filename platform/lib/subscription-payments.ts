import { prisma } from '@/lib/prisma'
import type { Transaction } from '@prisma/client'

/**
 * A subscription payment is linked to the transaction through its one-time
 * payment link. Keep the subscription history in step with the merchant's
 * confirmation (or undo) without making the payment status change depend on it.
 */
export async function syncSubscriptionPaymentFromTransaction(
  txn: Pick<Transaction, 'id' | 'merchantId' | 'paymentLinkId'>,
  status: 'success' | 'failed' | 'pending',
) {
  if (!txn.paymentLinkId) return null

  const payment = await prisma.subscriptionPayment.findUnique({
    where: { paymentLinkId: txn.paymentLinkId },
  })
  if (!payment || payment.merchantId !== txn.merchantId) return null

  const data =
    status === 'success'
      ? { status: 'paid', transactionId: txn.id, paidAt: new Date(), failureReason: null }
      : status === 'failed'
        ? {
            status: 'failed',
            transactionId: txn.id,
            paidAt: null,
            failureReason: 'Payment was not confirmed',
          }
        : { transactionId: txn.id, failureReason: null }

  return prisma.subscriptionPayment.update({ where: { id: payment.id }, data })
}
