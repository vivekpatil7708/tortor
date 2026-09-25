import crypto from 'crypto'
import type {
  ChannelCredentials,
  MessagingProvider,
  SendMessageInput,
  SendMessageResult,
} from './provider'
import { isInstagramEnabled } from './provider'

/**
 * Instagram/DM messaging is OPTIONAL and not enabled unless the merchant has
 * signed up for Meta's DM channel (API approval + app review) and the platform
 * feature flag `INSTAGRAM_MESSAGING_ENABLED=true` is set. Outbound sends
 * intentionally fail closed until then — the UI shows Instagram as "disabled".
 */
export class InstagramMessagingProvider implements MessagingProvider {
  readonly channel = 'instagram' as const
  readonly name = 'instagram'

  constructor(private credentials: ChannelCredentials) {}

  async sendMessage(): Promise<SendMessageResult> {
    if (!isInstagramEnabled()) {
      return {
        providerMessageId: null,
        ok: false,
        status: 'failed',
        error: 'instagram_not_ready: Instagram DM requires a Meta-approved app and the INSTAGRAM_MESSAGING_ENABLED flag.',
      }
    }
    return {
      providerMessageId: null,
      ok: false,
      status: 'failed',
      error: 'instagram_not_ready: outbound Instagram messaging is not yet integrated.',
    }
  }

  verifyWebhookSignature({ rawBody, signature, secret }: { rawBody: string; signature: string | null; secret: string }): boolean {
    if (!signature) return false
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    const a = Buffer.from(expected)
    const b = Buffer.from(signature.replace(/^sha256=/, ''))
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  }

  validateConfiguration(credentials?: Partial<ChannelCredentials> | null) {
    if (!isInstagramEnabled()) {
      return { ok: false, error: 'instagram_not_ready' }
    }
    const creds = credentials ?? this.credentials
    if (!creds?.accessToken) return { ok: false, error: 'Instagram access token is not configured' }
    return { ok: true }
  }

  supportsTemplates(): boolean {
    return false
  }

  supportsMedia(): boolean {
    return false
  }
}