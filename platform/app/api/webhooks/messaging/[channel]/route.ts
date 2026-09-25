import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getChannelCredentials } from '@/lib/messaging/connections'
import { getMessagingProvider } from '@/lib/messaging/provider'
import { handleDeliveryReceipt } from '@/lib/messaging/logs'
import { isInstagramEnabled } from '@/lib/messaging/provider'
import type { MessagingChannel } from '@/lib/messaging/events'

type StatusPayload = {
  id: string
  status: string
}

function parseWhatsAppStatuses(payload: Record<string, unknown>): Array<{ id: string; delivered: boolean; read: boolean }> {
  const entries = Array.isArray(payload.entry) ? (payload.entry as Record<string, unknown>[]) : []
  const out: Array<{ id: string; delivered: boolean; read: boolean }> = []
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? (entry.changes as Record<string, unknown>[]) : []
    for (const change of changes) {
      const value = (change.value ?? {}) as Record<string, unknown>
      const statuses = Array.isArray(value.statuses) ? (value.statuses as StatusPayload[]) : []
      for (const st of statuses) {
        out.push({
          id: st.id,
          delivered: st.status === 'delivered' || st.status === 'read',
          read: st.status === 'read',
        })
      }
    }
  }
  return out
}

function parseInstagramStatuses(payload: Record<string, unknown>): Array<{ id: string; delivered: boolean; read: boolean }> {
  const entries = Array.isArray(payload.entry) ? (payload.entry as Record<string, unknown>[]) : []
  const out: Array<{ id: string; delivered: boolean; read: boolean }> = []
  for (const entry of entries) {
    const messaging = Array.isArray(entry.messaging) ? (entry.messaging as Record<string, unknown>[]) : []
    for (const m of messaging) {
      const delivery = m.delivery as Record<string, unknown> | undefined
      const messageIds = Array.isArray(delivery?.mids) ? (delivery.mids as string[]) : []
      messageIds.forEach(id => out.push({ id, delivered: true, read: false }))
    }
  }
  return out
}

export async function GET(req: NextRequest, ctx: { params: { channel: string } }) {
  const channel = ['whatsapp', 'instagram'].find(c => c === ctx.params.channel) as MessagingChannel | undefined
  if (!channel) return NextResponse.json({ error: 'Invalid channel' }, { status: 400 })

  const mode = req.nextUrl.searchParams.get('hub.mode')
  const token = req.nextUrl.searchParams.get('hub.verify_token') ?? ''
  const challenge = req.nextUrl.searchParams.get('hub.challenge')

  if (mode === 'subscribe') {
    const conns = await prisma.channelConnection.findMany({ where: { channel, credentialsEncrypted: { not: null } } })
    for (const conn of conns) {
      const { webhookSecret } = await getChannelCredentials(conn.merchantId, channel)
      if (webhookSecret && webhookSecret === token) {
        return new NextResponse(challenge ?? 'ok')
      }
    }
    return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
  }
  return NextResponse.json({ status: 'ok' })
}

export async function POST(req: NextRequest, ctx: { params: { channel: string } }) {
  const channel = ['whatsapp', 'instagram'].find(c => c === ctx.params.channel) as MessagingChannel | undefined
  if (!channel) return NextResponse.json({ error: 'Invalid channel' }, { status: 400 })
  if (channel === 'instagram' && !isInstagramEnabled()) {
    return NextResponse.json({ error: 'Instagram messaging is not enabled' }, { status: 503 })
  }

  const rawBody = await req.text()
  if (!rawBody) return NextResponse.json({ error: 'Empty body' }, { status: 400 })
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Verify signature against each merchant that has a secret for this channel.
  const signature = req.headers.get('x-hub-signature-256')
  const conns = await prisma.channelConnection.findMany({ where: { channel, webhookSecretEncrypted: { not: null } } })
  let verified = false
  let verifiedMerchantId: string | null = null
  for (const conn of conns) {
    const { webhookSecret } = await getChannelCredentials(conn.merchantId, channel)
    if (!webhookSecret) continue
    const provider = getMessagingProvider(channel)
    if (provider.verifyWebhookSignature({ rawBody, signature, secret: webhookSecret })) {
      verified = true
      verifiedMerchantId = conn.merchantId
      break
    }
  }
  if (!verified) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const receipts = channel === 'whatsapp' ? parseWhatsAppStatuses(payload) : parseInstagramStatuses(payload)
  const results = []
  for (const r of receipts) {
    results.push(await handleDeliveryReceipt(verifiedMerchantId!, channel, r.id, { delivered: r.delivered, read: r.read }))
  }

  return NextResponse.json({ ok: true, receipts: results.length })
}