import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { OUTGOING_WEBHOOK_EVENTS } from '@/lib/webhook-delivery'
import { apiError, badRequest, notFound } from '@/lib/api-response'
import { isValidWebhookUrl } from '@/lib/validate-url'

const WEBHOOK_EVENTS: string[] = [...OUTGOING_WEBHOOK_EVENTS, '*']

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id: ctx.params.id, merchantId: session.id } })
    if (!endpoint) return notFound('Endpoint not found')
    return NextResponse.json({
      id: endpoint.id,
      url: endpoint.url,
      mode: endpoint.mode,
      active: endpoint.active,
      event_types: endpoint.eventTypes,
      failed_count: endpoint.failedCount,
      last_delivery_at: endpoint.lastDeliveryAt?.toISOString() ?? null,
      created_at: endpoint.createdAt.toISOString(),
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const body = (await req.json().catch(() => null)) as {
      url?: string
      mode?: string
      active?: boolean
      event_types?: string[]
      secret?: string
    } | null

    if (!body) return badRequest('Invalid body')

    const data: { url?: string; mode?: 'test' | 'live'; active?: boolean; eventTypes?: string[]; secretEncrypted?: string } = {}
    if (body.url !== undefined) {
      if (!isValidWebhookUrl(body.url)) return badRequest('A valid https URL is required')
      data.url = body.url
    }
    if (body.mode !== undefined) data.mode = body.mode === 'live' ? 'live' : 'test'
    if (body.active !== undefined) data.active = Boolean(body.active)
    if (body.secret !== undefined) {
      const secret = body.secret.trim()
      if (secret.length < 16) return badRequest('Secret must be at least 16 characters')
      data.secretEncrypted = secret
    }
    if (body.event_types !== undefined) {
      const rawEvents = Array.isArray(body.event_types) ? body.event_types : []
      const seen = new Set<string>()
      for (const e of rawEvents) {
        if (!WEBHOOK_EVENTS.includes(e)) return badRequest(`Invalid event type: ${e}`)
        seen.add(e)
      }
      data.eventTypes = seen.size ? Array.from(seen) : ['*']
    }

    const result = await prisma.webhookEndpoint.updateMany({
      where: { id: ctx.params.id, merchantId: session.id },
      data,
    })
    if (result.count === 0) return notFound('Endpoint not found')
    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update endpoint'
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const result = await prisma.webhookEndpoint.deleteMany({ where: { id: ctx.params.id, merchantId: session.id } })
    if (result.count === 0) return notFound('Endpoint not found')
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}