import { describe, expect, it } from 'vitest'
import { intentionalErrorMessage, publicErrorMessage } from './api-response'
import { passwordProblem } from './password-policy'
import { hashResetToken, newResetToken } from './reset-token'
import { isCrossSiteRequest } from './same-site'

describe('passwordProblem (one rule for signup and reset)', () => {
  it('accepts 8+ characters with upper, lower and a number', () => {
    expect(passwordProblem('Toropay2026')).toBeNull()
  })

  it('names what is missing', () => {
    expect(passwordProblem('Short1A')).toMatch(/at least 8/)
    expect(passwordProblem('alllowercase1')).toMatch(/uppercase/)
    expect(passwordProblem('ALLUPPERCASE1')).toMatch(/lowercase/)
    expect(passwordProblem('NoNumbersHere')).toMatch(/number/)
    expect(passwordProblem(undefined)).toMatch(/at least 8/)
  })

  it('refuses anything bcrypt would silently cut (over 72 bytes, counting multi-byte characters)', () => {
    expect(passwordProblem('Aa1' + 'x'.repeat(69))).toBeNull()
    expect(passwordProblem('Aa1' + 'x'.repeat(70))).toMatch(/at most 72/)
    expect(passwordProblem('Aa1' + '₹'.repeat(24))).toMatch(/at most 72/)
  })
})

describe('reset tokens', () => {
  it('stores only a fingerprint of the emailed token', () => {
    const { token, stored } = newResetToken()
    expect(stored).not.toBe(token)
    expect(stored).toBe(hashResetToken(token))
    expect(stored).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('isCrossSiteRequest (login CSRF)', () => {
  const headers = (h: Record<string, string>) => ({ get: (name: string) => h[name] ?? null })

  it('refuses requests the browser marks as coming from another site', () => {
    expect(isCrossSiteRequest(headers({ 'sec-fetch-site': 'cross-site' }), 'www.toropay.co.in')).toBe(true)
    expect(isCrossSiteRequest(headers({ origin: 'https://evil.example' }), 'www.toropay.co.in')).toBe(true)
  })

  it("allows ToroPay's own pages, sibling subdomains and non-browser clients", () => {
    expect(isCrossSiteRequest(headers({ 'sec-fetch-site': 'same-origin' }), 'www.toropay.co.in')).toBe(false)
    expect(isCrossSiteRequest(headers({ 'sec-fetch-site': 'same-site' }), 'www.toropay.co.in')).toBe(false)
    expect(isCrossSiteRequest(headers({ origin: 'https://www.toropay.co.in' }), 'www.toropay.co.in')).toBe(false)
    expect(isCrossSiteRequest(headers({}), 'www.toropay.co.in')).toBe(false)
  })
})

describe('publicErrorMessage (no raw technical errors to users)', () => {
  class FakePrismaError extends Error {
    code = 'P2022'
  }

  it('keeps messages the app throws on purpose', () => {
    expect(publicErrorMessage(new Error('Order not found'))).toBe('Order not found')
    expect(publicErrorMessage(new Error('Unauthorized'))).toBe('Unauthorized')
    expect(intentionalErrorMessage(new Error('Courier rejected the address'))).toBe('Courier rejected the address')
  })

  it('hides database, system and programming errors', () => {
    const generic = 'Something went wrong. Please try again.'
    const quiet = { error: console.error }
    console.error = () => {}
    try {
      expect(publicErrorMessage(new FakePrismaError('column merchants.email_verified_at does not exist'))).toBe(generic)
      expect(publicErrorMessage(Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), { code: 'ECONNREFUSED' }))).toBe(generic)
      expect(publicErrorMessage(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(generic)
      expect(intentionalErrorMessage(new FakePrismaError('x'))).toBeNull()
    } finally {
      console.error = quiet.error
    }
  })

  it('uses the fallback when something other than an Error is thrown', () => {
    expect(publicErrorMessage('boom', 'Login failed')).toBe('Login failed')
  })
})
