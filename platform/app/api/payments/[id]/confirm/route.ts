import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth'
import { settlePaymentFromExternal } from '@/lib/payments/webhook-processor'
import { apiError, notFound } from '@/lib/api-response'

/**
 * Merchant dashboard action: confirm a direct UPI payment as paid.
 * Idempotent — already-paid payments are a safe no-op.
 */
export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  let merchantId: string
  try {
    merchantId = (await requireSession()).id
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payment = await prisma.payment.findFirst({
    where: { id: ctx.params.id, merchantId },
  })
  if (!payment) return notFound('Payment not found')

  if (payment.status === 'paid') {
    return NextResponse.json({ status: 'paid', already: true })
  }

  const result = await settlePaymentFromExternal({
    paymentId: payment.id,
    merchantId,
    source: 'upi_merchant_confirm',
  })

  if (!result.ok || !result.changed) {
    return apiError(400, result.error ?? 'Could not confirm payment')
  }

  return NextResponse.json({ status: 'paid', changed: true })
}