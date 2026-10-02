import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { maskSecret, serializeSettings } from '@/lib/serializers'

export async function GET() {
  try {
    const session = await requireSession()
    let settings = await prisma.merchantSettings.findUnique({ where: { merchantId: session.id } })
    if (!settings) {
      settings = await prisma.merchantSettings.create({ data: { merchantId: session.id } })
    }
    return NextResponse.json(serializeSettings(settings))
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireSession()
    const body = await req.json()

    // The client only ever sees the masked secret; if it sends that back unchanged
    // (or omits the field), keep the stored secret instead of overwriting it.
    const existing = await prisma.merchantSettings.findUnique({ where: { merchantId: session.id } })
    const webhookSecret =
      body.webhook_secret === undefined ||
      (existing?.webhookSecret && body.webhook_secret === maskSecret(existing.webhookSecret))
        ? existing?.webhookSecret ?? null
        : body.webhook_secret || null

    const settings = await prisma.merchantSettings.upsert({
      where: { merchantId: session.id },
      create: {
        merchantId: session.id,
        smsEnabled: Boolean(body.sms_enabled),
        emailEnabled: Boolean(body.email_enabled),
        autoSettlement: body.auto_settlement !== false,
        settlementFrequency: body.settlement_frequency || 'daily',
        notificationEmail: body.notification_email || null,
        notificationPhone: body.notification_phone || null,
        webhookSecret,
      },
      update: {
        smsEnabled: Boolean(body.sms_enabled),
        emailEnabled: Boolean(body.email_enabled),
        autoSettlement: Boolean(body.auto_settlement),
        settlementFrequency: body.settlement_frequency || 'daily',
        notificationEmail: body.notification_email || null,
        notificationPhone: body.notification_phone || null,
        webhookSecret,
      },
    })

    return NextResponse.json({ settings: serializeSettings(settings) })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
