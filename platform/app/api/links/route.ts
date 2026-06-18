import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeLink } from '@/lib/serializers'
import { generateSlug } from '@/lib/utils'
import { isValidRedirectUrl, isValidWebhookUrl } from '@/lib/validate-url'

export async function GET() {
  try {
    const session = await requireSession()
    const links = await prisma.paymentLink.findMany({
      where: { merchantId: session.id },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(links.map(serializeLink))
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    const body = await req.json()

    if (!body.title || !body.upi_id) {
      return NextResponse.json({ error: 'Title and UPI ID are required' }, { status: 400 })
    }

    if (body.redirect_url && !isValidRedirectUrl(body.redirect_url)) {
      return NextResponse.json({ error: 'Invalid redirect URL' }, { status: 400 })
    }

    if (body.webhook_url && !isValidWebhookUrl(body.webhook_url)) {
      return NextResponse.json({ error: 'Invalid webhook URL' }, { status: 400 })
    }

    const slug = body.slug || generateSlug()
    const link = await prisma.paymentLink.create({
      data: {
        merchantId: session.id,
        upiId: body.upi_id,
        title: body.title,
        description: body.description || null,
        amount: body.amount != null ? Number(body.amount) : null,
        amountFlexible: Boolean(body.amount_flexible),
        minAmount: body.min_amount != null ? Number(body.min_amount) : null,
        maxAmount: body.max_amount != null ? Number(body.max_amount) : null,
        customFields: JSON.stringify(body.custom_fields || []),
        expiryAt: body.expiry_at ? new Date(body.expiry_at) : null,
        maxUses: body.max_uses != null ? Number(body.max_uses) : null,
        buttonText: body.button_text || null,
        redirectUrl: body.redirect_url || null,
        webhookUrl: body.webhook_url || null,
        slug,
      },
    })

    return NextResponse.json({ success: true, link: serializeLink(link) })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create link'
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}
