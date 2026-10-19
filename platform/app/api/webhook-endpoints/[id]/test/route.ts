import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { sendTestWebhook } from '@/lib/webhook-delivery'
import { apiError, publicErrorMessage } from '@/lib/api-response'

/** Send a sample order.created event to this endpoint so a merchant can test their receiver. */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireMerchant()
    const { id } = await ctx.params

    const result = await sendTestWebhook(id, session.id)
    if (!result.success && !result.logId) return apiError(404, 'Webhook endpoint not found')

    return NextResponse.json({
      success: result.success,
      log_id: result.logId ?? null,
      message: result.success
        ? 'Test event delivered. Check your endpoint received it.'
        : 'Test event sent but the endpoint did not return 2xx. See the delivery log for details.',
    })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Failed to send test event')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}
