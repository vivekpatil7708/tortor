import { POST as startCheckout } from '@/app/api/transactions/route'
import { PATCH as changeStatus } from '@/app/api/transactions/[txnId]/route'
import { newTxnId, request } from './helpers'

/** A customer starts paying on a payment link (the "Continue to pay" step). */
export async function startPayment(linkId: string, txnId = newTxnId(), amount = 499) {
  const res = await startCheckout(request('/api/transactions', {
    method: 'POST',
    body: { payment_link_id: linkId, txn_id: txnId, amount, customer_name: 'Asha', customer_phone: '+919999999999' },
  }))
  return { status: res.status, txnId }
}

/** "I've paid" (customer) or Confirm / Reject (merchant, with merchant_action). */
export const changePayment = (txnId: string, body: Record<string, unknown>) =>
  changeStatus(request(`/api/transactions/${txnId}`, { method: 'PATCH', body }), { params: Promise.resolve({ txnId }) })
