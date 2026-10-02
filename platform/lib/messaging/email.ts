import type {
  MessagingProvider,
  SendMessageInput,
  SendMessageResult,
} from './provider'
import { getEmailProvider } from '@/lib/emails/service'

/** Renders a plain HTML wrapper mirroring existing transactional emails. */
function renderHtml(body: string): string {
  const safe = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f0eb;font-family:-apple-system,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;border:1px solid #eee;padding:32px;">
<tr><td style="white-space:pre-wrap;color:#333;font-size:14px;line-height:1.7;">${safe}</td></tr>
</table></td></tr></table>
</body></html>`
}

/** Email channel adapter that reuses the existing email provider stack. */
export class EmailMessagingProvider implements MessagingProvider {
  static readonly instance = new EmailMessagingProvider()
  readonly channel = 'email' as const
  readonly name: string

  constructor() {
    this.name = getEmailProvider().name
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const provider = getEmailProvider()
    const result = await provider.sendTransactionalEmail({
      to: input.to,
      subject: input.subject ?? '',
      html: renderHtml(input.body),
    })
    if (result.ok) {
      return { providerMessageId: result.providerMessageId, ok: true, status: 'sent' }
    }
    return { providerMessageId: null, ok: false, status: 'failed', error: 'Provider rejected the email' }
  }

  verifyWebhookSignature(): boolean {
    // Email doesn't use merchant webhook signatures for delivery receipts.
    return false
  }

  validateConfiguration() {
    return getEmailProvider().validateConfiguration()
  }

  supportsTemplates(): boolean {
    return false
  }

  supportsMedia(): boolean {
    return false
  }
}