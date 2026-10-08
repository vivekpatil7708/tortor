import { describe, expect, it } from 'vitest'
import { expiryMoment, limitsProblem, linkLimitsInput, rangeProblem } from './link-limits'

// "Stop after N paid payments" and "Expires on" in the New link form, checked
// in the browser and again on the server.
const NOW = new Date('2026-10-07T06:00:00Z') // 7 Oct, 11:30 in India

describe('link limits in the form', () => {
  it('accepts no limits, a whole number of payments, and today or a later day', () => {
    expect(limitsProblem('', '', NOW)).toBe('')
    expect(limitsProblem('10', '2026-10-07', NOW)).toBe('')
    expect(limitsProblem(' 1 ', '2027-01-31', NOW)).toBe('')
  })

  it('explains a bad number or a past day', () => {
    expect(limitsProblem('0', '', NOW)).toContain('whole number')
    expect(limitsProblem('2.5', '', NOW)).toContain('whole number')
    expect(limitsProblem('100001', '', NOW)).toContain('whole number')
    expect(limitsProblem('', '2026-10-06', NOW)).toBe('Expires on: choose today or a later date')
    expect(limitsProblem('', '2026-02-30', NOW)).toBe('Expires on: choose a date')
  })

  it('keeps a link open until the end of its last day in India', () => {
    expect(expiryMoment('2026-10-10')).toBe('2026-10-10T18:30:00.000Z')
    expect(expiryMoment('')).toBeNull()
  })

  it("checks a customer-entered amount's minimum and maximum", () => {
    expect(rangeProblem('', '')).toBe('')
    expect(rangeProblem('10', '5000')).toBe('')
    expect(rangeProblem('5000', '10')).toBe("The minimum can't be more than the maximum")
    expect(rangeProblem('0', '')).toBe('Minimum must be more than ₹0')
    expect(rangeProblem('', '-5')).toBe('Maximum must be more than ₹0')
  })
})

describe('link limits on the server', () => {
  const now = NOW.getTime()

  it('stores valid limits, and none when they are left out', () => {
    expect(linkLimitsInput(undefined, undefined, now)).toEqual({ ok: true, maxUses: null, expiryAt: null })
    expect(linkLimitsInput(null, '', now)).toEqual({ ok: true, maxUses: null, expiryAt: null })
    expect(linkLimitsInput('25', '2026-10-10T18:30:00.000Z', now)).toEqual({
      ok: true, maxUses: 25, expiryAt: new Date('2026-10-10T18:30:00.000Z'),
    })
  })

  it('refuses values that used to reach the database as they were', () => {
    for (const bad of [0, -1, 2.5, 'ten', 100_001]) {
      expect(linkLimitsInput(bad, null, now).ok, String(bad)).toBe(false)
    }
    expect(linkLimitsInput(null, 'not a date', now)).toEqual({ ok: false, error: 'expiry_at must be a date and time' })
    expect(linkLimitsInput(null, '2026-10-06T00:00:00Z', now)).toEqual({ ok: false, error: 'expiry_at must be in the future' })
  })
})
