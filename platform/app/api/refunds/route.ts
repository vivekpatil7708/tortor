import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { apiError, publicErrorMessage } from '@/lib/api-response'
import { createManualRefund, listManualRefunds } from '@/lib/refund-tracking'
import { createRefundSchema, refundListQuerySchema } from '@/lib/validators'
import { zodMessage } from '@/lib/zod-error'

const MISSING_TABLE =
  'Refund tracking is not set up yet. Run platform/prisma/migrations/add_refunds.sql and try again.'

function isMissingTable(err: unknown) {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err.code === 'P2021' || err.code === 'P2022')
  )
}

function errorStatus(message: string): number {
  if (message === 'Unauthorized') return 401
  if (
    message === 'Choose an order or a transaction to refund' ||
    message === 'Order not found' ||
    message === 'Transaction not found' ||
    message === 'Only a paid order can be refunded' ||
    message === 'Only a payment received from the customer can be refunded' ||
    message === 'Refund amount must be at least 0.01' ||
    message === 'There is no paid amount to refund' ||
    message === 'Refund amount must be greater than zero' ||
    message.startsWith('Refund cannot exceed') ||
    message === 'This payment has already been fully refunded'
  ) {
    return 400
  }
  return 500
}

/** Refunds recorded by the signed-in merchant, newest first. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const parsed = refundListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
    if (!parsed.success) return apiError(400, zodMessage(parsed.error) || 'Invalid request')

    const result = await listManualRefunds(session.id, parsed.data)
    return NextResponse.json(result)
  } catch (err) {
    if (isMissingTable(err)) return apiError(503, MISSING_TABLE)
    const msg = publicErrorMessage(err, 'Could not load refunds')
    return apiError(errorStatus(msg), msg)
  }
}

/**
 * Record a refund. The merchant sends the actual UPI refund themselves; this
 * only stores the amount, reason and whether it has been processed.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const parsed = createRefundSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return apiError(400, zodMessage(parsed.error) || 'Invalid request')

    const refund = await createManualRefund({
      merchantId: session.id,
      orderId: parsed.data.order_id ?? null,
      transactionId: parsed.data.transaction_id ?? null,
      amount: parsed.data.amount,
      reason: parsed.data.reason ?? null,
      actorUserId: session.accountId,
    })

    return NextResponse.json({ refund }, { status: 201 })
  } catch (err) {
    if (isMissingTable(err)) return apiError(503, MISSING_TABLE)
    const msg = publicErrorMessage(err, 'Could not record the refund')
    return apiError(errorStatus(msg), msg)
  }
}
