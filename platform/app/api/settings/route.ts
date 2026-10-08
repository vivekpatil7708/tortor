import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { handleError } from '@/lib/api-response'
import { prisma } from '@/lib/prisma'
import { maskSecret, serializeSettings } from '@/lib/serializers'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET() {
  try {
    const session = await requireSession()
    let settings = await prisma.merchantSettings.findUnique({ where: { merchantId: session.id } })
    if (!settings) {
      settings = await prisma.merchantSettings.create({ data: { merchantId: session.id } })
    }
    return NextResponse.json(serializeSettings(settings))
  } catch (err) {
    return handleError(err, 'Could not load your settings')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireSession()
    const body = await req.json()

    // Payment alerts are emailed here (Settings → Notifications), so it must be a real address.
    const notificationEmail = typeof body.notification_email === 'string' ? body.notification_email.trim() : ''
    if (notificationEmail && (notificationEmail.length > 254 || !EMAIL.test(notificationEmail))) {
      return NextResponse.json({ error: 'Enter a valid email address for alerts, or leave it empty.' }, { status: 400 })
    }

    // The client only ever sees the masked secret; if it sends that back unchanged
    // (or omits the field), keep the stored secret instead of overwriting it.
    const existing = await prisma.merchantSettings.findUnique({ where: { merchantId: session.id } })
    const webhookSecret =
      body.webhook_secret === undefined ||
      (existing?.webhookSecret && body.webhook_secret === maskSecret(existing.webhookSecret))
        ? existing?.webhookSecret ?? null
        : body.webhook_secret || null

    // Only the settings sent are changed: Developers saves just the webhook secret and
    // Settings just the notifications, so neither can reset the other (e.g. turn alerts off).
    const sent = (key: string) => Object.prototype.hasOwnProperty.call(body, key)
    const changes = {
      ...(sent('sms_enabled') ? { smsEnabled: Boolean(body.sms_enabled) } : {}),
      ...(sent('email_enabled') ? { emailEnabled: Boolean(body.email_enabled) } : {}),
      ...(sent('auto_settlement') ? { autoSettlement: Boolean(body.auto_settlement) } : {}),
      ...(sent('settlement_frequency') ? { settlementFrequency: body.settlement_frequency || 'daily' } : {}),
      ...(sent('notification_email') ? { notificationEmail: notificationEmail || null } : {}),
      ...(sent('notification_phone') ? { notificationPhone: body.notification_phone || null } : {}),
      ...(sent('webhook_secret') ? { webhookSecret } : {}),
    }

    const settings = await prisma.merchantSettings.upsert({
      where: { merchantId: session.id },
      create: {
        merchantId: session.id,
        smsEnabled: Boolean(body.sms_enabled),
        emailEnabled: Boolean(body.email_enabled),
        autoSettlement: body.auto_settlement !== false,
        settlementFrequency: body.settlement_frequency || 'daily',
        notificationEmail: notificationEmail || null,
        notificationPhone: body.notification_phone || null,
        webhookSecret,
      },
      update: changes,
    })

    return NextResponse.json({ settings: serializeSettings(settings) })
  } catch (err) {
    return handleError(err, 'Could not save your settings')
  }
}
