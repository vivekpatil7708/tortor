import { NextRequest, NextResponse } from 'next/server'
import { handleError, badRequest, apiError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getChannelsStatus, saveChannelConnection, disconnectChannel, getChannelCredentials } from '@/lib/messaging/connections'
import { getMessagingProvider } from '@/lib/messaging/provider'
import { sendMessage } from '@/lib/messaging/engine'
import { sampleMessageContext } from '@/lib/messaging/templates'
import { generateCourierWebhookSecret } from '@/lib/couriers/connections'
import type { MessagingChannel } from '@/lib/messaging/events'

export async function GET() {
  try {
    const session = await requireSession()
    const status = await getChannelsStatus(session.id)
    return NextResponse.json({ channels: status })
  } catch (err) {
    return handleError(err, 'Unauthorized')
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    const body = await req.json()
    const action = body.action
    const channel = ['whatsapp', 'instagram', 'email'].includes(body.channel) ? (body.channel as MessagingChannel) : null
    if (!channel) return badRequest('Invalid channel')

    if (action === 'connect') {
      if (channel === 'email') return badRequest('Email uses the built-in provider and cannot be connected here')
      const credentials = body.credentials
      if (!credentials || typeof credentials !== 'object') return badRequest('credentials are required to connect a channel')

      const provider = getMessagingProvider(channel, credentials)
      const check = provider.validateConfiguration(credentials)
      if (check && !check.ok) {
        return NextResponse.json(
          { error: `Connection validation failed: ${check.error ?? 'invalid configuration'}` },
          { status: 422 },
        )
      }

      await saveChannelConnection({
        merchantId: session.id,
        channel,
        credentials,
        accountId: body.accountId ?? null,
        metadata: body.metadata ?? {},
      })
      return NextResponse.json({ ok: true })
    }

    if (action === 'disconnect') {
      await disconnectChannel(session.id, channel)
      return NextResponse.json({ ok: true })
    }

    if (action === 'regenerate-webhook') {
      const secret = generateCourierWebhookSecret()
      await saveChannelConnection({ merchantId: session.id, channel, webhookSecret: secret })
      return NextResponse.json({ webhook_secret: secret })
    }

    if (action === 'test') {
      const { credentials, webhookSecret } = await getChannelCredentials(session.id, channel)
      const provider = getMessagingProvider(channel, credentials ?? undefined)
      const to = channel === 'email' ? String(body.to ?? '') : String(body.to ?? body.phone ?? '')
      const result = await sendMessage({
        merchantId: session.id,
        channel,
        eventType: 'manual_message',
        to,
        context: sampleMessageContext(body.context ?? {}),
        idempotencyKey: body.idempotencyKey ?? `test_${Date.now()}`,
        createdBy: 'Merchant test',
      })
      void webhookSecret
      if (result.status === 'failed') return apiError(500, result.reason ?? 'Send failed')
      return NextResponse.json({ result })
    }

    return badRequest('Unknown action')
  } catch (err) {
    return handleError(err)
  }
}