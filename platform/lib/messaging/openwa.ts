import crypto from 'crypto'
import type {
  MessagingProvider,
  SendMessageInput,
  SendMessageResult,
} from './provider'

/**
 * OpenWA (self-hosted WhatsApp gateway) adapter.
 *
 * Talks to the gateway's own REST API rather than Meta's Cloud API, so a
 * merchant can send WhatsApp messages from their own connected number without
 * a WhatsApp Business account. Configured entirely by env:
 *
 *   OPENWA_URL        base URL of the gateway, no trailing slash
 *   OPENWA_API_KEY    the gateway's API key, sent as `X-API-Key`
 *   OPENWA_SESSION_ID the session UUID - NOT its display name
 *
 * All three are read lazily so a missing key surfaces as a failed send at
 * request time, never as a crash at import time.
 *
 * Endpoint and payload verified against a live OpenWA instance (OpenAPI doc at
 * /api/docs-json plus a real request): `POST /api/sessions/{sessionId}/messages/send-text`
 * with `{ chatId, text }`, answering 201 `{ messageId, timestamp }`.
 *
 * `sessionId` must be the session UUID. The display name is rejected by the
 * gateway with 400 "Session '<name>' is not active" - the gateway's engine
 * registry is keyed by id, so a name never resolves.
 */

/** Default timeout for a send. WhatsApp sends are synchronous on the gateway. */
const DEFAULT_TIMEOUT_MS = 20_000

/** Gateway errors we treat as "try again later" rather than a permanent failure. */
const TRANSIENT_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504])

export interface OpenWaConfig {
  url: string
  apiKey: string
  sessionId: string
}

/**
 * Read OpenWA settings from the environment. Returns null when the integration
 * is not configured at all, so callers can fall back deliberately instead of
 * sending against a half-configured gateway.
 */
export function openWaConfig(env: Partial<NodeJS.ProcessEnv> = process.env): OpenWaConfig | null {
  const url = (env.OPENWA_URL || '').trim().replace(/\/+$/, '')
  const apiKey = (env.OPENWA_API_KEY || '').trim()
  const sessionId = (env.OPENWA_SESSION_ID || '').trim()
  if (!url || !apiKey || !sessionId) return null
  return { url, apiKey, sessionId }
}

/** Whether OpenWA is configured well enough to attempt a send. */
export function isOpenWaConfigured(env: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  return openWaConfig(env) !== null
}

/**
 * Normalise a phone number into the chat id OpenWA expects (`<digits>@c.us`).
 *
 * Handles the shapes that reach us from order records and manual entry:
 * `+91 98765 43210`, `09876543210`, `919876543210`, `98765-43210`. A leading
 * `0` is a national trunk prefix and is dropped. A bare 10-digit number is
 * assumed to be an Indian mobile missing its country code, which is by far the
 * common case here; without this the gateway accepts `9876543210@c.us` but the
 * message does not reach anyone, so it fails silently. Returns null when there
 * is nothing usable, so a malformed number fails loudly rather than being sent
 * to a bogus chat id.
 */
export function toChatId(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null

  // `0` prefixes a national number (09876543210); strip it. A bare 10-digit
  // number is a local mobile number, so add India's country code.
  let trimmed = digits.startsWith('0') ? digits.replace(/^0+/, '') : digits
  if (trimmed.length === 10) trimmed = `91${trimmed}`

  if (trimmed.length < 11 || trimmed.length > 15) return null
  return `${trimmed}@c.us`
}

export class OpenWaProvider implements MessagingProvider {
  readonly channel = 'whatsapp' as const
  readonly name = 'openwa'

  constructor(
    private readonly config: OpenWaConfig,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const check = this.validateConfiguration()
    if (!check.ok) {
      return { providerMessageId: null, ok: false, status: 'failed', error: check.error }
    }

    const chatId = toChatId(input.to)
    if (!chatId) {
      return {
        providerMessageId: null,
        ok: false,
        status: 'failed',
        error: `A valid phone number is required to send WhatsApp to "${input.to}"`,
      }
    }

    const text = input.body
    if (!text || !text.trim()) {
      return { providerMessageId: null, ok: false, status: 'failed', error: 'WhatsApp message body is empty' }
    }

    const url = `${this.config.url}/api/sessions/${encodeURIComponent(this.config.sessionId)}/messages/send-text`

    // Reuse the caller's idempotency key when given one, so a retry of the same
    // logical message replays the first response instead of sending twice.
    const idempotencyKey = resolveIdempotencyKey(input)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': this.config.apiKey,
    }
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ chatId, text }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const detail = await readError(res)
        return {
          providerMessageId: null,
          ok: false,
          status: 'failed',
          error: `OpenWA send failed (${res.status}): ${detail}`,
        }
      }

      const body = (await res.json().catch(() => ({}))) as { messageId?: string }
      const messageId = body.messageId ? String(body.messageId) : null
      if (!messageId) {
        // A 2xx without an id means we cannot confirm delivery or correlate a
        // later receipt. Treat it as sent but unconfirmed rather than inventing
        // an id that receipts will never match.
        return { providerMessageId: null, ok: true, status: 'sent' }
      }
      return { providerMessageId: messageId, ok: true, status: 'sent' }
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError'
      return {
        providerMessageId: null,
        ok: false,
        status: 'failed',
        error: aborted
          ? `OpenWA did not respond within ${this.timeoutMs}ms`
          : err instanceof Error
            ? err.message
            : 'OpenWA send failed',
      }
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * OpenWA has no webhook signature scheme of its own; inbound webhooks are a
   * shared-secret header check done by the caller. Always false here so a
   * caller cannot mistake this for verified delivery.
   */
  verifyWebhookSignature(): boolean {
    return false
  }

  validateConfiguration(): { ok: boolean; error?: string } {
    if (!this.config.url) return { ok: false, error: 'OPENWA_URL is not configured' }
    if (!this.config.apiKey) return { ok: false, error: 'OPENWA_API_KEY is not configured' }
    if (!this.config.sessionId) return { ok: false, error: 'OPENWA_SESSION_ID is not configured' }
    return { ok: true }
  }

  supportsTemplates(): boolean {
    // Templates are rendered to plain text by the caller; OpenWA's send-text
    // takes free text only.
    return false
  }

  supportsMedia(): boolean {
    // send-text is text-only; media would need send-image/send-document.
    return false
  }
}

/**
 * Derive an idempotency key for a send. OpenWA accepts 1-255 visible ASCII
 * characters, unique per session; anything outside that is dropped rather than
 * letting the gateway reject the whole request over a malformed header.
 */
function resolveIdempotencyKey(input: SendMessageInput): string | null {
  const candidate = typeof input.metadata?.idempotencyKey === 'string' ? input.metadata.idempotencyKey : ''
  if (!candidate) return null
  if (!/^[\x21-\x7e]{1,255}$/.test(candidate)) {
    // Fall back to a stable hash so the send is still safe to retry.
    return crypto.createHash('sha256').update(candidate).digest('hex')
  }
  return candidate
}

/** Pull the gateway's own message out of an error body, tolerating non-JSON. */
async function readError(res: Response): Promise<string> {
  const raw = await res.text().catch(() => '')
  let detail = raw.slice(0, 300)
  try {
    const parsed = JSON.parse(raw) as { message?: string; error?: string; code?: string; retryAfterSeconds?: number }
    const parts = [parsed.message || parsed.error].filter(Boolean)
    if (parsed.code) parts.push(`(${parsed.code})`)
    if (parsed.retryAfterSeconds) parts.push(`retry after ${parsed.retryAfterSeconds}s`)
    if (parts.length) detail = parts.join(' ')
  } catch {
    // Not JSON - keep the truncated body.
  }
  if (TRANSIENT_STATUSES.has(res.status)) return `${detail} [transient, safe to retry]`
  return detail || res.statusText
}

export { TRANSIENT_STATUSES as OPENWA_TRANSIENT_STATUSES }
