import { describe, expect, it } from 'vitest'
import { supportEmailInput, supportPhoneInput } from './support-contact'
// The support email and phone a business shows its customers: a real address,
// or nothing. Both are optional and an empty value clears them.

describe('support email', () => {
  it('accepts a real address and trims it', () => {
    expect(supportEmailInput('  help@yourbusiness.in ')).toEqual({ ok: true, value: 'help@yourbusiness.in' })
  })
  it("an empty value clears it", () => {
    expect(supportEmailInput('')).toEqual({ ok: true, value: null })
    expect(supportEmailInput('   ')).toEqual({ ok: true, value: null })
    expect(supportEmailInput(undefined)).toEqual({ ok: true, value: null })
  })
  it('refuses a missing @, a space inside, or something too long', () => {
    for (const bad of ['not-an-email', 'a b@example.in', `a@${'x'.repeat(250)}.in`, 'help@business']) {
      expect(supportEmailInput(bad).ok, bad).toBe(false)
    }
  })
})

describe('support phone', () => {
  it('accepts digits with spaces, a leading + and hyphens, and trims it', () => {
    expect(supportPhoneInput(' +91 98765 43210 ')).toEqual({ ok: true, value: '+91 98765 43210' })
    expect(supportPhoneInput('98765-43210')).toEqual({ ok: true, value: '98765-43210' })
  })
  it("an empty value clears it", () => {
    expect(supportPhoneInput('')).toEqual({ ok: true, value: null })
  })
  it('refuses letters, more than 20 characters, or too few digits', () => {
    expect(supportPhoneInput('98765O4321').ok).toBe(false)
    expect(supportPhoneInput('1'.repeat(21)).ok).toBe(false)
    expect(supportPhoneInput('123').ok).toBe(false)
  })
})