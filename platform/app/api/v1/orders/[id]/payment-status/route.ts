import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeApiRequest, logApiRequest } from '@/lib/api-request'
import { notFound } from '@/lib/api-response'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authorized = await authorizeApiRequest(req, 'read')
  if (authorized instanceof NextResponse) return authorized
  const { auth, mode } = authorized

  const orderId = (await ctx.params).id
  const route = `/api/v1/orders/${orderId}/payment-status`

  const payment = await prisma.payment.findFirst({
    where: { orderId, merchantId: auth.merchantId, mode },
    orderBy: { createdAt: 'desc' },
  })

  if (!payment) {
    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route,
      statusCode: 404 })
    return notFound('No payment found for this order')
  }

  const responseBody = {
    order_id: orderId,
    payment_id: payment.id,
    payment_reference: payment.paymentReference,
    payment_status: payment.status,
    amount: payment.amount.toNumber(),
    currency: payment.currency,
    mode: payment.mode,
    paid_at: payment.paidAt?.toISOString() ?? null,
    failed_at: payment.failedAt?.toISOString() ?? null,
    amount_mismatch: payment.amountMismatch,
    checkout_session_id: payment.checkoutSessionId,
  }

  await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route,
      statusCode: 200 })
  return NextResponse.json(responseBody)
}