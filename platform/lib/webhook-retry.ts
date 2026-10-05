import crypto from 'crypto'

/** Minutes to wait before each retry of a failed webhook; after the last one it is marked failed. */
export const WEBHOOK_RETRY_MINUTES = [1, 5, 30, 120, 360, 1440]

/**
 * Retries that fell due longer ago than this are skipped. They date from
 * before retries ran, and resending old payment events now could make a
 * merchant's system act on a stale payment.
 */
export const RETRY_STALE_AFTER_HOURS = 48

/** The oldest retry time that is still worth acting on. */
export function retryWindowStart(now = Date.now()): Date {
  return new Date(now - RETRY_STALE_AFTER_HOURS * 3_600_000)
}

/** When to try again after `failedAttempts` failed deliveries, or null to give up. */
export function nextWebhookAttemptAt(failedAttempts: number, now = Date.now()): Date | null {
  const minutes = WEBHOOK_RETRY_MINUTES[failedAttempts - 1]
  return minutes === undefined ? null : new Date(now + minutes * 60_000)
}

/** Checks the `Authorization: Bearer <CRON_SECRET>` header sent by Vercel Cron and the GitHub schedule. */
export function isCronRequestAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false
  const given = Buffer.from(header)
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && crypto.timingSafeEqual(given, expected)
}
