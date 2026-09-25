import { NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { sendTestWebhook } from '@/lib/webhook-delivery'
import { notFound } from '@/lib/api-response'

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const result = await sendTestWebhook(ctx.params.id, session.id)
    if (!result.success) return notFound('Endpoint not found')
    return NextResponse.json({ success: true, log_id: result.logId })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}