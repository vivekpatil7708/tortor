import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { authorizeApiRequest, logApiRequest } from '@/lib/api-request'
import { apiError, notFound, publicErrorMessage } from '@/lib/api-response'
import { serializeTransaction } from '@/lib/serializers'
import { changeTransactionStatus } from '@/lib/transaction-status-change'

// Shared handler for POST /api/v1/transactions/{id}/confirm and .../reject.
// Confirming records the payment as received; rejecting marks it failed (within
// the same 30-minute undo rule as the dashboard). Both are merchant actions on
// payment-link transactions and reuse changeTransactionStatus for the rules,
// optimistic locking, audit entry and webhook.

const paymentDetailsSchema = z.object({
  payment_app: z.string().max(100).optional(),
  payer_vpa: z.string().max(100).optional(),
  upi_txn_id: z.string().max(100).optional(),
})

export async function setTransactionStatus(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
  to: 'success' | 'failed'
) {
  const action = to === 'success' ? 'confirm' : 'reject'
  const authorized = await authorizeApiRequest(req, 'write')
  if (authorized instanceof NextResponse) return authorized
  const { auth } = authorized

  const id = (await props.params).id
  const route = `/api/v1/transactions/${id}/${action}`
  const requestBody = await req.json().catch(() => ({}))

  const parsed = paymentDetailsSchema.safeParse(requestBody ?? {})
  if (!parsed.success) {
    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'POST', route, statusCode: 400 })
    return apiError(400, 'Invalid request body: payment_app, payer_vpa and upi_txn_id must be strings')
  }

  try {
    // The public txn_id (TXN...) or the internal id both work.
    const txn = await prisma.transaction.findFirst({
      where: { OR: [{ txnId: id }, { id }], merchantId: auth.merchantId },
    })
    if (!txn) {
      await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'POST', route, statusCode: 404 })
      return notFound('Transaction not found')
    }

    const result = await changeTransactionStatus({
      txn,
      to,
      by: 'merchant',
      paymentDetails: {
        paymentApp: parsed.data.payment_app,
        payerVpa: parsed.data.payer_vpa,
        upiTxnId: parsed.data.upi_txn_id,
      },
    })

    if (result.outcome === 'blocked' || result.outcome === 'conflict') {
      await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'POST', route, statusCode: 409 })
      return apiError(409, result.reason)
    }

    // Same status again (a repeat confirm): change nothing and don't re-send the webhook.
    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'POST', route, statusCode: 200 })
    return NextResponse.json({
      success: true,
      outcome: result.outcome === 'applied' ? to : 'unchanged',
      transaction: serializeTransaction(result.transaction),
      redirect_url: result.outcome === 'applied' ? result.redirectUrl : null,
    })
  } catch (err) {
    const message = publicErrorMessage(err, `Failed to ${action} the transaction`)
    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'POST', route, statusCode: 500 })
    return apiError(500, message)
  }
}
