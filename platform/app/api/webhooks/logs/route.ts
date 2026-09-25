import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const endpointId = req.nextUrl.searchParams.get('endpoint_id')
    const status = req.nextUrl.searchParams.get('status')
    const take = Math.min(Number(req.nextUrl.searchParams.get('limit') || 50), 200)

    const logs = await prisma.webhookDeliveryLog.findMany({
      where: {
        merchantId: session.id,
        ...(endpointId ? { endpointId } : {}),
        ...(status ? { status: status as never } : {}),
      },
      include: { endpoint: { select: { url: true, mode: true } } },
      orderBy: { createdAt: 'desc' },
      take,
    })

    return NextResponse.json(
      logs.map(l => ({
        id: l.id,
        endpoint_id: l.endpointId,
        endpoint_url: l.endpoint.url,
        mode: l.endpoint.mode,
        event_id: l.eventId,
        event_type: l.eventType,
        status: l.status,
        response_code: l.responseCode,
        response_body: l.responseBody,
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