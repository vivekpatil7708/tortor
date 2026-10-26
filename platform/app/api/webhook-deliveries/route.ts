import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMerchant } from '@/lib/tenant'
import { canWrite } from '@/lib/team-roles'
import { retryWebhookDelivery } from '@/lib/webhook-delivery'
import { apiError, notFound, publicErrorMessage } from '@/lib/api-response'
import type { Prisma, WebhookDeliveryStatus } from '@prisma/client'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 200
const STATUSES: WebhookDeliveryStatus[] = ['pending', 'delivered', 'failed', 'retrying', 'disabled']

function statusParam(value: string | null): WebhookDeliveryStatus | null {
  return value && (STATUSES as string[]).includes(value) ? value as WebhookDeliveryStatus : null
}

/** All recent webhook deliveries for the signed-in merchant, newest first. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const params = new URL(req.url).searchParams
    const endpointId = params.get('endpoint_id') || undefined
    const eventType = params.get('event_type') || undefined
    const status = statusParam(params.get('status'))
    const limitParam = Number(params.get('limit'))
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT

    const baseWhere: Prisma.WebhookDeliveryLogWhereInput = {
      merchantId: session.id,
      ...(endpointId ? { endpointId } : {}),
      ...(eventType ? { eventType } : {}),
    }
    const where: Prisma.WebhookDeliveryLogWhereInput = {
      ...baseWhere,
      ...(status ? { status } : {}),
    }

    const [logs, total, grouped, endpoints] = await Promise.all([
      prisma.webhookDeliveryLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { endpoint: { select: { url: true, mode: true } } },
      }),
      prisma.webhookDeliveryLog.count({ where }),
      prisma.webhookDeliveryLog.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: { _all: true },
      }),
      prisma.webhookEndpoint.findMany({
        where: { merchantId: session.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, url: true, mode: true },
      }),
    ])

    const counts: Record<string, number> = Object.fromEntries(STATUSES.map(s => [s, 0]))
    for (const row of grouped) counts[row.status] = row._count._all

    return NextResponse.json({
      logs: logs.map(log => ({
        id: log.id,
        event_id: log.eventId,
        event_type: log.eventType,
        status: log.status,
        endpoint_id: log.endpointId,
        endpoint_url: log.endpoint.url,
        endpoint_mode: log.endpoint.mode,
        url: log.url,
        response_code: log.responseCode,
        response_body: log.responseBody ? log.responseBody.slice(0, 500) : null,
        error_message: log.errorMessage,
        retry_count: log.retryCount,
        next_retry_at: log.nextRetryAt?.toISOString() ?? null,
        delivered_at: log.deliveredAt?.toISOString() ?? null,
        created_at: log.createdAt.toISOString(),
        // Enough to inspect the event from the dashboard without making the
        // response huge for a stuck endpoint that returned a wall of HTML.
        payload: log.payload.slice(0, 20_000),
      })),
      total,
      counts,
      endpoints: endpoints.map(endpoint => ({
        id: endpoint.id,
        url: endpoint.url,
        mode: endpoint.mode,
      })),
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

/** Retry a failed delivery. The log must belong to this merchant. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireMerchant()
    if (!canWrite(session.teamRole)) return apiError(403, 'You have view-only access to this account.')

    const body = (await req.json().catch(() => ({}))) as { logId?: string }
    if (!body.logId) return apiError(400, 'logId is required')

    const log = await prisma.webhookDeliveryLog.findFirst({
      where: { id: body.logId, merchantId: session.id },
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
