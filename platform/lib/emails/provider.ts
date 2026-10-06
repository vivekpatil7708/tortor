import type { EmailAutomation } from '@prisma/client'

export interface SendEmailInput {
  to: string
  subject: string
  html: string
}

export interface SendEmailResult {
  providerMessageId: string | null
  ok: boolean
  /** Why it wasn't sent: HTTP status and error name only, never the message (it can contain the address). */
  error?: string
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

export const DEFAULT_FROM = 'ToroPay <no-reply@toropay.co.in>'

/** Sender for these emails: EMAIL_FROM if set, else RESEND_FROM (what sign-up and password emails use). */
export function senderAddress(): string {
  return process.env.EMAIL_FROM || process.env.RESEND_FROM || DEFAULT_FROM
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend'

  async sendTransactionalEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const key = process.env.RESEND_API_KEY
    if (!key) return { providerMessageId: null, ok: false, error: 'RESEND_API_KEY is not set' }
    const from = senderAddress()
    const first = await postEmail(key, from, input)
    // The email service refused that sender (403, e.g. a domain it hasn't verified): use the default once.
    if (first.status === 403 && from !== DEFAULT_FROM) return (await postEmail(key, DEFAULT_FROM, input)).result
    return first.result
  }

  validateConfiguration() {
    if (!process.env.RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY is not set' }
    return { ok: true }
  }
}

async function postEmail(key: string, from: string, input: SendEmailInput): Promise<{ status: number; result: SendEmailResult }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { name?: unknown }
    const name = typeof body.name === 'string' ? body.name.replace(/[^\w.-]/g, '').slice(0, 60) : 'unknown_error'
    return { status: res.status, result: { providerMessageId: null, ok: false, error: `HTTP ${res.status} ${name}` } }
  }
  const body = (await res.json().catch(() => ({}))) as { id?: string }
  return { status: res.status, result: { providerMessageId: body.id ?? null, ok: true } }
}