import { describe, expect, it } from 'vitest'
import { isCronRequestAuthorized, nextWebhookAttemptAt, WEBHOOK_RETRY_MINUTES } from './webhook-retry'

describe('nextWebhookAttemptAt', () => {
  const NOW = Date.UTC(2026, 9, 6, 12, 0, 0)
  const minutesLater = (failed: number) => {
    const at = nextWebhookAttemptAt(failed, NOW)
    return at ? (at.getTime() - NOW) / 60_000 : null
  }

  it('waits 1 min, 5 min, 30 min, 2 h, 6 h and 24 h between attempts', () => {
    expect([1, 2, 3, 4, 5, 6].map(minutesLater)).toEqual([1, 5, 30, 120, 360, 1440])
  })

  it('gives up after the last retry', () => {
    expect(nextWebhookAttemptAt(WEBHOOK_RETRY_MINUTES.length + 1, NOW)).toBeNull()
  })
})

describe('isCronRequestAuthorized', () => {
  it('accepts only the exact bearer secret', () => {
    expect(isCronRequestAuthorized('Bearer s3cret-value', 's3cret-value')).toBe(true)
    expect(isCronRequestAuthorized('Bearer wrong', 's3cret-value')).toBe(false)
    expect(isCronRequestAuthorized('s3cret-value', 's3cret-value')).toBe(false)
    expect(isCronRequestAuthorized(null, 's3cret-value')).toBe(false)
  })

  it('refuses everything when no secret is configured', () => {
    expect(isCronRequestAuthorized('Bearer ', '')).toBe(false)
    expect(isCronRequestAuthorized('Bearer undefined', undefined)).toBe(false)
  })
})
