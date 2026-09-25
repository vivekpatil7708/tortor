import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import {
  getShopifyConnection,
  serializeShopifyConnection,
  generateShopifyWebhookSecret,
  SHOPIFY_WEBHOOK_PATH,
} from '@/lib/shopify'
import { TOROPAY_PUBLIC_URL } from '@/lib/checkout'
import { apiError, badRequest } from '@/lib/api-response'
import { z } from 'zod'
import { zodMessage } from '@/lib/zod-error'

const updateSchema = z.object({
  store_domain: z.string().min(3).max(253).optional(),
  enabled: z.boolean().optional(),
  topic_orders_create: z.boolean().optional(),
  topic_orders_paid: z.boolean().optional(),
  regenerate_secret: z.boolean().optional(),
})

export async function GET() {
  try {
    const session = await requireMerchant()
    const conn = await getShopifyConnection(session.id)
    if (!conn) {
      return NextResponse.json({
        connected: false,
        store_domain: null,
        webhook_secret: null,
        webhook_url: `${TOROPAY_PUBLIC_URL}${SHOPIFY_WEBHOOK_PATH}`,
      })
    }
    return NextResponse.json(serializeShopifyConnection(conn))
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const body = await req.json().catch(() => null)
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) return badRequest(zodMessage(parsed.error) ?? 'Invalid Shopify settings')

    const existing = await getShopifyConnection(session.id)
    const storeDomain = (parsed.data.store_domain ?? existing?.storeDomain ?? '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
    if (!storeDomain) return badRequest('Store domain is required')

    const data = {
      merchantId: session.id,
      storeDomain,
      webhookSecret: existing?.webhookSecret ?? generateShopifyWebhookSecret(),
      topicOrdersCreate: parsed.data.topic_orders_create ?? existing?.topicOrdersCreate ?? true,
      topicOrdersPaid: parsed.data.topic_orders_paid ?? existing?.topicOrdersPaid ?? true,
      enabled: parsed.data.enabled ?? existing?.enabled ?? true,
    }

    const conn = await prisma.shopifyConnection.upsert({
      where: { merchantId: session.id },
      update: {
        storeDomain: data.storeDomain,
        topicOrdersCreate: data.topicOrdersCreate,
        topicOrdersPaid: data.topicOrdersPaid,
        enabled: data.enabled,
        ...(parsed.data.regenerate_secret ? { webhookSecret: generateShopifyWebhookSecret() } : {}),
      },
      create: data,
    })

    return NextResponse.json({ success: true, connection: serializeShopifyConnection(conn) })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update Shopify settings'
    const code = (err as { code?: string })?.code
    if (code === 'P2002') return apiError(409, 'That store domain is already connected to another account')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}