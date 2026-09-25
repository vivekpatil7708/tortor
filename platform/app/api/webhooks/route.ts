import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { generateWebhookSecret, OUTGOING_WEBHOOK_EVENTS } from '@/lib/webhook-delivery'
import { apiError, badRequest } from '@/lib/api-response'
import { isValidWebhookUrl } from '@/lib/validate-url'

const WEBHOOK_EVENTS: string[] = [...OUTGOING_WEBHOOK_EVENTS, '*']

function serializeEndpoint(e: {
  id: string
  url: string
  mode: string
  active: boolean
  eventTypes: unknown
  failedCount: number
  lastDeliveryAt: Date | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: e.id,
    url: e.url,
    mode: e.mode,
    active: e.active,
    event_types: e.eventTypes,
    failed_count: e.failedCount,
    last_delivery_at: e.lastDeliveryAt?.toISOString() ?? null,
    created_at: e.createdAt.toISOString(),
  }
}

export async function GET() {
  try {
    const session = await requireMerchant()
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { merchantId: session.id },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(endpoints.map(serializeEndpoint))
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const body = (await req.json().catch(() => null)) as {
      url?: string
      mode?: string
      event_types?: string[]
      secret?: string
    } | null

    if (!body?.url || !isValidWebhookUrl(body.url)) return badRequest('A valid https URL is required')
    const mode = body.mode === 'live' ? 'live' : 'test'

    const rawEvents = Array.isArray(body.event_types) ? body.event_types : []
    const seen = new Set<string>()
    for (const e of rawEvents) {
      if (!WEBHOOK_EVENTS.includes(e)) return badRequest(`Invalid event type: ${e}`)
      seen.add(e)
    }
    const eventTypes = seen.size ? Array.from(seen) : ['*']

    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        merchantId: session.id,
        url: body.url,
        secretEncrypted: body.secret?.trim() || generateWebhookSecret(),
        mode,
        active: true,
        eventTypes,
      },
    })

    return NextResponse.json(
      { success: true, endpoint: serializeEndpoint(endpoint), secret: body?.secret?.trim() || endpoint.secretEncrypted },
      { status: 201 }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create endpoint'
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}