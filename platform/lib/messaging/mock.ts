import crypto from 'crypto'
import type {
  MessagingProvider,
  SendMessageInput,
  SendMessageResult,
} from './provider'

export interface MockSentMessage extends SendMessageInput {
  channel: string
  providerMessageId: string
  delivered: boolean
  read: boolean
  sentAt: Date
}

const MOCK_MESSAGES: MockSentMessage[] = []

/** In-memory capture of mock channel sends (for tests + dev preview). */
export function getMockMessages(): MockSentMessage[] {
  return [...MOCK_MESSAGES]
}

export function clearMockMessages(): void {
  MOCK_MESSAGES.length = 0
}

/** Simulate a provider delivery receipt for a mock message. */
export function markMockMessageDelivered(providerMessageId: string): boolean {
  const msg = MOCK_MESSAGES.find(m => m.providerMessageId === providerMessageId)
  if (!msg) return false
  msg.delivered = true
  return true
}

export function markMockMessageRead(providerMessageId: string): boolean {
  const msg = MOCK_MESSAGES.find(m => m.providerMessageId === providerMessageId)
  if (!msg) return false
  msg.delivered = true
  msg.read = true
  return true
}

/**
 * In-memory messaging provider for local development and tests. No external
 * network access; simulates send (and delivery/read receipts on demand).
 */
export class MockMessagingProvider implements MessagingProvider {
  static readonly instance = new MockMessagingProvider()
  readonly channel = 'whatsapp' as const
  readonly name = 'mock-messaging'

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const providerMessageId = `mockmsg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
    MOCK_MESSAGES.push({
      ...input,
      channel: 'whatsapp',
      providerMessageId,
      delivered: false,
      read: false,
      sentAt: new Date(),
    })
    return { providerMessageId, ok: true, status: 'sent' }
  }

  verifyWebhookSignature({ rawBody, signature, secret }: { rawBody: string; signature: string | null; secret: string }): boolean {
    if (!signature) return false
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    const a = Buffer.from(expected)
    const b = Buffer.from(signature)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  }

  validateConfiguration() {
    return { ok: true }
  }

  supportsTemplates(): boolean {
    return true
  }

  supportsMedia(): boolean {
    return true
  }
}