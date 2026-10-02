import crypto from 'crypto'

/**
 * Courier webhook signature conventions.
 *
 * Providers attach a signature header computed as HMAC-SHA256 over the raw
 * request body using the merchant's webhook secret. The header name varies per
 * provider (see provider.ts), but the payload is always the raw body, never a
 * re-serialized version.
 */

export function signCourierWebhook(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
}

export function verifyCourierWebhookSignature(params: {
  rawBody: string
  signature: string | null
  secret: string
}): boolean {
  const { rawBody, signature, secret } = params
  if (!signature || !secret) return false
  let provided: Buffer
  try {
    provided = Buffer.from(signature, 'hex')
  } catch {
    return false
  }
  const expected = Buffer.from(signCourierWebhook(rawBody, secret), 'hex')
  if (provided.length !== expected.length) return false
  return crypto.timingSafeEqual(provided, expected)
}