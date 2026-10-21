import { describe, expect, it } from 'vitest'
import { isDuplicateOpen, isHumanUserAgent } from './open-tracking'

describe('isHumanUserAgent', () => {
  it('counts a normal browser', () => {
    expect(
      isHumanUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
      )
    ).toBe(true)
  })

  it('counts a phone reading the email', () => {
    expect(
      isHumanUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')
    ).toBe(true)
  })

  it('does not count a mail client that fetches images on its own', () => {
    expect(isHumanUserAgent('Mozilla/5.0 (compatible; Google-PageRenderer) prefetch')).toBe(false)
  })

  it('does not count a bot', () => {
    expect(isHumanUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(false)
    expect(isHumanUserAgent('facebookexternalhit/1.1')).toBe(false)
    expect(isHumanUserAgent('Slackbot-LinkExpanding 1.0')).toBe(false)
  })

  it('does not count a link checker', () => {
    expect(isHumanUserAgent('curl/8.4.0')).toBe(false)
    expect(isHumanUserAgent('python-requests/2.31.0')).toBe(false)
  })

  it('does not count a request with no user agent', () => {
    expect(isHumanUserAgent(null)).toBe(false)
    expect(isHumanUserAgent('')).toBe(false)
    expect(isHumanUserAgent('   ')).toBe(false)
  })
})

describe('isDuplicateOpen', () => {
  it('is not a duplicate when there was no earlier open', () => {
    expect(isDuplicateOpen(null)).toBe(false)
  })

  it('is not a duplicate when the earlier open was long ago', () => {
    const now = new Date('2026-10-21T10:00:00.000Z')
    const earlier = new Date(now.getTime() - 7 * 60 * 60 * 1000)
    expect(isDuplicateOpen(earlier, now)).toBe(false)
  })

  it('is a duplicate when the earlier open was within the window', () => {
    const now = new Date('2026-10-21T10:00:00.000Z')
    const earlier = new Date(now.getTime() - 60 * 60 * 1000)
    expect(isDuplicateOpen(earlier, now)).toBe(true)
  })
})
