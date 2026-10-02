import { describe, expect, it } from 'vitest'
import { base32Decode, base32Encode, generateTotpSecret, totpCode, verifyTotp } from './totp'

// RFC 6238 appendix B test secret ("12345678901234567890", SHA-1).
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('base32', () => {
  it('round-trips bytes', () => {
    const bytes = Buffer.from('12345678901234567890')
    expect(base32Encode(bytes)).toBe(RFC_SECRET)
    expect(base32Decode(RFC_SECRET).toString()).toBe('12345678901234567890')
  })

  it('generates 32-character secrets that decode to 20 bytes', () => {
    const secret = generateTotpSecret()
    expect(secret).toMatch(/^[A-Z2-7]{32}$/)
    expect(base32Decode(secret)).toHaveLength(20)
  })
})

describe('totpCode', () => {
  // RFC 6238 appendix B, last 6 of the 8 published digits.
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ])('matches the RFC test vector at T=%i', (seconds, code) => {
    expect(totpCode(RFC_SECRET, seconds * 1000)).toBe(code)
  })
})

describe('verifyTotp', () => {
  const now = 1234567890 * 1000

  it('accepts the current code and one step of clock drift', () => {
    expect(verifyTotp(RFC_SECRET, '005924', now)).toBe(true)
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 30_000), now)).toBe(true)
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now + 30_000), now)).toBe(true)
  })

  it('rejects old codes, wrong codes and bad input', () => {
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 90_000), now)).toBe(false)
    expect(verifyTotp(RFC_SECRET, '000000', now)).toBe(false)
    for (const bad of ['', '12345', '1234567', 'abcdef', '00592a']) {
      expect(verifyTotp(RFC_SECRET, bad, now)).toBe(false)
    }
  })

  it('ignores spaces in the typed code', () => {
    expect(verifyTotp(RFC_SECRET, '005 924', now)).toBe(true)
  })
})
