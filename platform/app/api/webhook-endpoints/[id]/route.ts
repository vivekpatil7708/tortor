import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { apiError, notFound, publicErrorMessage } from '@/lib/api-response'
import { isValidWebhookUrl } from '@/lib/safe-fetch'
import { OUTGOING_WEBHOOK_EVENTS } from '@/lib/webhook-delivery'

type Body = { url?: string; mode?: string; eventTypes?: unknown; active?: boolean }

function normalizeEventTypes(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null
  const allowed = new Set<string>(OUTGOING_WEBHOOK_EVENTS)
  const picked = input.filter((e): e is string => typeof e === 'string' && (allowed.has(e) || e === '*'))
  const unique = Array.from(new Set(picked))
  return unique.length ? unique : null
}

/** Update an endpoint: URL, mode, subscribed events or on/off. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireMerchant()
    const { id } = await ctx.params

    const existing = await prisma.webhookEndpoint.findFirst({ where: { id, merchantId: session.id } })
    if (!existing) return notFound('Webhook endpoint not found')

    const body = (await req.json().catch(() => ({}))) as Body
    const data: Record<string, unknown> = {}

    if (body.url !== undefined) {
      const url = body.url.trim()
      if (!url) return apiError(400, 'Webhook URL is required')
      if (!isValidWebhookUrl(url)) return apiError(400, 'Enter a public https URL, for example https://example.com/webhooks')
      data.url = url
    }
    if (body.mode !== undefined) data.mode = body.mode === 'test' ? 'test' : 'live'
    if (body.active !== undefined) data.active = Boolean(body.active)
    if (body.eventTypes !== undefined) {
      const events = normalizeEventTypes(body.eventTypes)
      if (!events) return apiError(400, 'Choose at least one event to send')
      data.eventTypes = events
    }

    if (!Object.keys(data).length) return apiError(400, 'Nothing to update')

    const updated = await prisma.webhookEndpoint.update({ where: { id }, data })
    return NextResponse.json({
      id: updated.id,
      url: updated.url,
      mode: updated.mode,
      active: updated.active,
      event_types: Array.isArray(updated.eventTypes) ? updated.eventTypes : [],
    })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Failed to update webhook endpoint')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}

/** Delete an endpoint and its delivery history. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireMerchant()
    const { id } = await ctx.params
    const result = await prisma.webhookEndpoint.deleteMany({ where: { id, merchantId: session.id } })
    if (result.count !== 1) return notFound('Webhook endpoint not found')
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
