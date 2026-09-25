import type { EmailAutomation } from '@prisma/client'

export interface SendEmailInput {
  to: string
  subject: string
  html: string
}

export interface SendEmailResult {
  providerMessageId: string | null
  ok: boolean
}

export interface EmailProvider {
  readonly name: string
  sendTransactionalEmail(input: SendEmailInput): Promise<SendEmailResult>
  validateConfiguration(): { ok: boolean; error?: string }
}

const MOCK_EMAILS: SendEmailInput[] = []

/** In-memory capture of mock emails (for tests + dev preview). */
export function getMockEmails(): SendEmailInput[] {
  return [...MOCK_EMAILS]
}

export function clearMockEmails(): void {
  MOCK_EMAILS.length = 0
}

export class MockEmailProvider implements EmailProvider {
  readonly name = 'mock'

  async sendTransactionalEmail(input: SendEmailInput): Promise<SendEmailResult> {
    MOCK_EMAILS.push(input)
    return { providerMessageId: null, ok: true }
  }

  validateConfiguration() {
    return { ok: true }
  }
}

const RESEND_KEY = process.env.RESEND_API_KEY || ''

export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend'

  async sendTransactionalEmail(input: SendEmailInput): Promise<SendEmailResult> {
    if (!RESEND_KEY) return { providerMessageId: null, ok: false }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'ToroPay <no-reply@toropay.co.in>',
        to: [input.to],
        subject: input.subject,
        html: input.html,
      }),
    })
    if (!res.ok) return { providerMessageId: null, ok: false }
    const body = (await res.json()) as { id?: string }
    return { providerMessageId: body.id ?? null, ok: true }
  }

  validateConfiguration() {
    if (!RESEND_KEY) return { ok: false, error: 'RESEND_API_KEY is not set' }
    return { ok: true }
  }
}