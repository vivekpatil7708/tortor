import type { MessagingChannel } from './events'
import { EmailMessagingProvider } from './email'
import { WhatsAppBusinessProvider } from './whatsapp'
import { InstagramMessagingProvider } from './instagram'
import { MockMessagingProvider } from './mock'

export type { MessagingChannel }

export interface ChannelCredentials {
  accessToken?: string
  phoneNumberId?: string
  businessAccountId?: string
  appSecret?: string
  [key: string]: unknown
}

export interface SendMessageInput {
  to: string
  subject?: string | null
  body: string
  templateName?: string | null
  mediaUrl?: string | null
  metadata?: Record<string, unknown> | null
}

export interface SendMessageResult {
  providerMessageId: string | null
  ok: boolean
  status: 'queued' | 'sent' | 'delivered' | 'failed'
  error?: string
}

/**
 * Messaging provider abstraction for WhatsApp / Instagram / email. Business
 * logic must only depend on this interface — never on a specific provider SDK.
 */
export interface MessagingProvider {
  readonly channel: MessagingChannel
  readonly name: string
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>
  verifyWebhookSignature(params: { rawBody: string; signature: string | null; secret: string }): boolean
  validateConfiguration(credentials?: Partial<ChannelCredentials> | null): { ok: boolean; error?: string }
  supportsTemplates(): boolean
  supportsMedia(): boolean
}

const MOCK_ALLOWED = process.env.MESSAGING_ALLOW_MOCK === 'true' || process.env.NODE_ENV !== 'production'

/**
 * Resolve a provider for a channel + stored credentials. Without real
 * credentials the mock provider is returned (tests / local dev). Production
 * callers must validate the channel connection before sending.
 */
export function getMessagingProvider(
  channel: MessagingChannel,
  credentials?: Partial<ChannelCredentials> | null,
): MessagingProvider {
  switch (channel) {
    case 'email':
      return EmailMessagingProvider.instance
    case 'whatsapp': {
      if (credentials?.accessToken && credentials?.phoneNumberId) {
        return new WhatsAppBusinessProvider(credentials as ChannelCredentials)
      }
      return MockMessagingProvider.instance
    }
    case 'instagram': {
      if (MOCK_ALLOWED && !isInstagramEnabled()) {
        return MockMessagingProvider.instance
      }
      if (credentials?.accessToken) return new InstagramMessagingProvider(credentials as ChannelCredentials)
      return MockMessagingProvider.instance
    }
    default:
      throw new Error(`Unsupported messaging channel: ${channel}`)
  }
}

export function isInstagramEnabled(): boolean {
  return process.env.INSTAGRAM_MESSAGING_ENABLED === 'true'
}

/** Whether the in-memory mock provider may serve sends (dev/tests unless opted in). */
export function mockMessagingAllowed(): boolean {
  return MOCK_ALLOWED
}
