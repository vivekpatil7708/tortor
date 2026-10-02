import { prisma } from '@/lib/prisma'
import { encryptJson, decryptJson } from '@/lib/couriers/crypto'
import type { MessagingChannel } from './events'
import type { ChannelCredentials } from './provider'

export interface ChannelConnectionView {
  channel: MessagingChannel
  connected: boolean
  error?: string
  accountId: string | null
  hasCredentials: boolean
  hasWebhookSecret: boolean
  isEnabled: boolean
}

export interface SaveConnectionInput {
  merchantId: string
  channel: MessagingChannel
  credentials?: ChannelCredentials
  webhookSecret?: string
  accountId?: string | null
  metadata?: Record<string, unknown>
  isEnabled?: boolean
}

/** Upsert a channel connection, storing credentials ENCRYPTED at rest. */
export async function saveChannelConnection(input: SaveConnectionInput) {
  const existing = await prisma.channelConnection.findUnique({
    where: { merchantId_channel: { merchantId: input.merchantId, channel: input.channel } },
  })
  if (!existing) {
    return prisma.channelConnection.create({
      data: {
        merchantId: input.merchantId,
        channel: input.channel,
        status: input.credentials ? 'connected' : 'disconnected',
        accountId: input.accountId ?? null,
        metadata: JSON.stringify(input.metadata ?? {}),
        credentialsEncrypted: input.credentials ? encryptJson(input.credentials) : null,
        webhookSecretEncrypted: input.webhookSecret ? encryptJson(input.webhookSecret) : null,
        isEnabled: input.isEnabled ?? true,
      },
    })
  }
  return prisma.channelConnection.update({
    where: { id: existing.id },
    data: {
      status: input.credentials ? 'connected' : existing.credentialsEncrypted ? 'connected' : 'disconnected',
      accountId: input.accountId !== undefined ? input.accountId : existing.accountId,
      metadata: input.metadata ? JSON.stringify(input.metadata) : existing.metadata,
      credentialsEncrypted: input.credentials ? encryptJson(input.credentials) : existing.credentialsEncrypted,
      webhookSecretEncrypted: input.webhookSecret ? encryptJson(input.webhookSecret) : existing.webhookSecretEncrypted,
      isEnabled: input.isEnabled ?? existing.isEnabled,
    },
  })
}

/** Returns the decrypted credentials ONLY on the server side. Never exposed via API. */
export async function getChannelCredentials(
  merchantId: string,
  channel: MessagingChannel,
): Promise<{ credentials: ChannelCredentials | null; webhookSecret: string | null }> {
  const conn = await prisma.channelConnection.findUnique({
    where: { merchantId_channel: { merchantId, channel } },
  })
  if (!conn) return { credentials: null, webhookSecret: null }
  const credentials = conn.credentialsEncrypted ? decryptJson<ChannelCredentials>(conn.credentialsEncrypted) : null
  const webhookSecret = conn.webhookSecretEncrypted ? decryptJson<string>(conn.webhookSecretEncrypted) : null
  return { credentials, webhookSecret }
}

/** Status view for the dashboard — never leaks credential values. */
export async function getChannelsStatus(merchantId: string): Promise<ChannelConnectionView[]> {
  const conns = await prisma.channelConnection.findMany({ where: { merchantId } })
  const byChannel = new Map(conns.map(c => [c.channel, c]))
  const channels: MessagingChannel[] = ['whatsapp', 'instagram', 'email']
  return channels.map(channel => {
    const conn = byChannel.get(channel)
    if (channel === 'email') {
      return {
        channel,
        connected: false,
        accountId: null,
        hasCredentials: false,
        hasWebhookSecret: false,
        isEnabled: true,
      }
    }
    if (!conn) {
      return { channel, connected: false, accountId: null, hasCredentials: false, hasWebhookSecret: false, isEnabled: true }
    }
    return {
      channel,
      connected: conn.status === 'connected' && Boolean(conn.credentialsEncrypted),
      error: conn.status === 'error' ? 'Channel has errors. Try reconnecting.' : undefined,
      accountId: conn.accountId,
      hasCredentials: Boolean(conn.credentialsEncrypted),
      hasWebhookSecret: Boolean(conn.webhookSecretEncrypted),
      isEnabled: conn.isEnabled,
    }
  })
}

export async function setChannelStatus(
  merchantId: string,
  channel: MessagingChannel,
  status: 'connected' | 'disconnected' | 'error',
) {
  return prisma.channelConnection.update({
    where: { merchantId_channel: { merchantId, channel } },
    data: { status },
  })
}

export async function disconnectChannel(merchantId: string, channel: MessagingChannel) {
  return prisma.channelConnection.update({
    where: { merchantId_channel: { merchantId, channel } },
    data: { credentialsEncrypted: null, webhookSecretEncrypted: null, status: 'disconnected' },
  })
}