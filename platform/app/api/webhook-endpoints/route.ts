import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { apiError, publicErrorMessage } from '@/lib/api-response'
import { isValidWebhookUrl } from '@/lib/safe-fetch'
import { OUTGOING_WEBHOOK_EVENTS, generateWebhookSecret } from '@/lib/webhook-delivery'
import { EMAIL_NOT_VERIFIED } from '@/lib/email-verification'
import { isOwnerRole } from '@/lib/team-roles'

type Body = { url?: string; mode?: string; eventTypes?: unknown; active?: boolean }

/** Keep only event names we actually emit; '*' subscribes to everything. */
function normalizeEventTypes(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const allowed = new Set<string>(OUTGOING_WEBHOOK_EVENTS)
  const picked = input.filter((e): e is string => typeof e === 'string' && (allowed.has(e) || e === '*'))
  return Array.from(new Set(picked))
}

/** List webhook endpoints. The signing secret is never returned, only its presence. */
export async function GET() {
  try {
    const session = await requireMerchant()
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { merchantId: session.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        url: true,
        mode: true,
        active: true,
        eventTypes: true,
        failedCount: true,
        lastDeliveryAt: true,
        createdAt: true,
      },
    })
    return NextResponse.json(
      endpoints.map(e => ({
        id: e.id,
        url: e.url,
        mode: e.mode,
        active: e.active,
        event_types: Array.isArray(e.eventTypes) ? e.eventTypes : [],
        failed_count: e.failedCount,
        last_delivery_at: e.lastDeliveryAt?.toISOString() ?? null,
        created_at: e.createdAt.toISOString(),
      }))
    )
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

/** Create an endpoint. A signing secret is generated once and returned exactly once. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireMerchant()
    if (!isOwnerRole(session.teamRole)) return apiError(403, 'Only the account owner can manage webhook endpoints.')
    if (!session.emailVerifiedAt) return apiError(403, EMAIL_NOT_VERIFIED)

    const body = (await req.json().catch(() => ({}))) as Body
    const url = body.url?.trim()
    if (!url) return apiError(400, 'Webhook URL is required')
    if (!isValidWebhookUrl(url)) return apiError(400, 'Enter a public https URL, for example https://example.com/webhooks')

    const eventTypes = normalizeEventTypes(body.eventTypes)
    if (!eventTypes.length) return apiError(400, 'Choose at least one event to send')

    const mode = body.mode === 'test' ? 'test' : 'live'
    const secret = generateWebhookSecret()

    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        merchantId: session.id,
        url,
        mode,
        eventTypes,
        // Stored as given; deliveries sign with it and never expose it again.
        secretEncrypted: secret,
        active: body.active === false ? false : true,
      },
    })

    return NextResponse.json(
      { id: endpoint.id, url: endpoint.url, mode: endpoint.mode, event_types: eventTypes, secret },
      { status: 201 }
    )
  } catch (err) {
    const msg = publicErrorMessage(err, 'Failed to create webhook endpoint')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}
