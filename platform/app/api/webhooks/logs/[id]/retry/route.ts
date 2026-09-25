import { NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { retryWebhookDelivery } from '@/lib/webhook-delivery'
import { notFound } from '@/lib/api-response'

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const log = await prisma.webhookDeliveryLog.findFirst({ where: { id: ctx.params.id, merchantId: session.id } })
    if (!log) return notFound('Delivery not found')

    const status = await retryWebhookDelivery(ctx.params.id)
    return NextResponse.json({ success: true, status })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}