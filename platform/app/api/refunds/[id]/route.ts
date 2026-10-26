import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { apiError, notFound, publicErrorMessage } from '@/lib/api-response'
import { markRefundProcessed } from '@/lib/refund-tracking'
import { processRefundSchema } from '@/lib/validators'
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

/**
 * Mark a refund as processed after the merchant has actually sent the money.
 * The customer is emailed (and WhatsApped when connected) by the helper.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireMerchant()
    const { id } = await ctx.params
    const parsed = processRefundSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return apiError(400, zodMessage(parsed.error) || 'Refunds can only be marked as processed')

    const result = await markRefundProcessed({
      merchantId: session.id,
      refundId: id,
      actorUserId: session.accountId,
    })
    return NextResponse.json(result)
  } catch (err) {
    if (isMissingTable(err)) return apiError(503, MISSING_TABLE)
    if (err instanceof Error && err.message === 'Refund not found') return notFound('Refund not found')
    if (err instanceof Error && err.message === 'A failed refund cannot be marked as processed') {
      return apiError(409, err.message)
    }
    const msg = publicErrorMessage(err, 'Could not update the refund')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}
