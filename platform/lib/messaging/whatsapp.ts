import crypto from 'crypto'
import type {
  ChannelCredentials,
  MessagingProvider,
  SendMessageInput,
  SendMessageResult,
} from './provider'

const WHATSAPP_GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0'
const WHATSAPP_GRAPH_API = process.env.WHATSAPP_GRAPH_API || 'https://graph.facebook.com'

/**
 * WhatsApp Business Platform (Meta Cloud API) adapter. Only usable when an
 * access token + phone number id are supplied (either via env or stored in a
 * merchant's ChannelConnection). Messages go through the Graph API `/messages`
 * endpoint.
 */
export class WhatsAppBusinessProvider implements MessagingProvider {
  readonly channel = 'whatsapp' as const
  readonly name = 'whatsapp'

  constructor(private credentials: ChannelCredentials) {}

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const { accessToken, phoneNumberId } = this.credentials
    const check = this.validateConfiguration(this.credentials)
    if (!check.ok) return { providerMessageId: null, ok: false, status: 'failed', error: check.error }

    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to,
    }
    if (input.templateName) {
      payload.type = 'template'
      payload.template = {
        name: input.templateName,
        language: { code: 'en' },
        components: [{ type: 'body', parameters: [] }],
      }
      return this.post(accessToken!, phoneNumberId!, payload, input)
    }

    payload.type = 'text'
    payload.text = { preview_url: true, body: input.body }
    if (input.mediaUrl) {
      payload.type = 'image'
      payload.image = { link: input.mediaUrl }
    }
    return this.post(accessToken!, phoneNumberId!, payload, input)
  }

  private async post(
    accessToken: string,
    phoneNumberId: string,
    payload: Record<string, unknown>,
    input: SendMessageInput,
  ): Promise<SendMessageResult> {
    try {
      const res = await fetch(
        `${WHATSAPP_GRAPH_API}/${WHATSAPP_GRAPH_VERSION}/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(payload),
        },
      )
      if (!res.ok) {
        const text = await res.text()
        return {
          providerMessageId: null,
          ok: false,
          status: 'failed',
          error: `WhatsApp send failed (${res.status}): ${text.slice(0, 300)}`,
        }
      }
      const body = (await res.json()) as { messages?: Array<{ id?: string }> }
      return {
        providerMessageId: body.messages?.[0]?.id ?? null,
        ok: true,
        status: 'sent',
      }
    } catch (err) {
      return {
        providerMessageId: null,
        ok: false,
        status: 'failed',
        error: err instanceof Error ? err.message : 'WhatsApp send failed',
      }
    }
  }

  verifyWebhookSignature({ rawBody, signature, secret }: { rawBody: string; signature: string | null; secret: string }): boolean {
    // Meta sends `x-hub-signature-256: sha256=<hex>`.
    if (!signature) return false
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    const provided = signature.replace(/^sha256=/, '')
    const a = Buffer.from(expected)
    const b = Buffer.from(provided)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  }

  validateConfiguration(credentials?: Partial<ChannelCredentials> | null) {
    const creds = credentials ?? this.credentials
    if (!creds?.accessToken) return { ok: false, error: 'WhatsApp access token is not configured' }
    if (!creds?.phoneNumberId) return { ok: false, error: 'WhatsApp phone number id is not configured' }
    return { ok: true }
  }

  supportsTemplates(): boolean {
    return true
  }

  supportsMedia(): boolean {
    return true
  }
}