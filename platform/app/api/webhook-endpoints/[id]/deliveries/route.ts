import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { retryWebhookDelivery } from '@/lib/webhook-delivery'
import { apiError, notFound, publicErrorMessage } from '@/lib/api-response'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/** Recent deliveries for one endpoint, newest first. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireMerchant()
    const { id } = await ctx.params

    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: { id, merchantId: session.id },
      select: { id: true },
    })
    if (!endpoint) return notFound('Webhook endpoint not found')

    const limitParam = Number(new URL(req.url).searchParams.get('limit'))
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT

    const logs = await prisma.webhookDeliveryLog.findMany({
      where: { endpointId: id, merchantId: session.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        eventId: true,
        eventType: true,
        status: true,
        responseCode: true,
        responseBody: true,
        errorMessage: true,
        retryCount: true,
        nextRetryAt: true,
        deliveredAt: true,
        createdAt: true,
      },
    })

    return NextResponse.json(
      logs.map(l => ({
        id: l.id,
        event_id: l.eventId,
        event_type: l.eventType,
        status: l.status,
        response_code: l.responseCode,
        // Trimmed so a huge response can't bloat the payload.
        response_body: l.responseBody ? l.responseBody.slice(0, 500) : null,
        error_message: l.errorMessage,
        retry_count: l.retryCount,
        next_retry_at: l.nextRetryAt?.toISOString() ?? null,
        delivered_at: l.deliveredAt?.toISOString() ?? null,
        created_at: l.createdAt.toISOString(),
      }))
    )
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

/** Retry one delivery (by log id) that is failed or retrying. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireMerchant()
    const { id } = await ctx.params

    const body = (await req.json().catch(() => ({}))) as { logId?: string }
    if (!body.logId) return apiError(400, 'logId is required')

    // The log must belong to this endpoint, which must belong to this merchant.
    const log = await prisma.webhookDeliveryLog.findFirst({
      where: { id: body.logId, endpointId: id, merchantId: session.id },
      select: { id: true },
    })
    if (!log) return notFound('Delivery not found')

    const status = await retryWebhookDelivery(log.id)
    if (!status) return apiError(400, 'This delivery can no longer be retried')
    return NextResponse.json({ success: true, status })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Failed to retry delivery')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}
