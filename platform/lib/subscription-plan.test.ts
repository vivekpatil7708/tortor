import { describe, expect, it } from 'vitest'
import {
  addBillingFrequency,
  addDaysToDay,
  advanceBillingDay,
  billingDayLabel,
  isBillingDay,
  isSubscriptionFrequency,
} from './subscription-plan'

describe('subscription billing dates', () => {
  it('moves weekly plans by seven calendar days', () => {
    expect(addBillingFrequency('2026-10-27', 'weekly')).toBe('2026-11-03')
    expect(addDaysToDay('2026-12-29', 7)).toBe('2027-01-05')
  })

  it('clamps monthly plans to the last day of a shorter month', () => {
    expect(addBillingFrequency('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(addBillingFrequency('2028-01-31', 'monthly')).toBe('2028-02-29')
  })

  it('clamps yearly plans on leap years', () => {
    expect(addBillingFrequency('2028-02-29', 'yearly')).toBe('2029-02-28')
    expect(addBillingFrequency('2026-10-27', 'yearly')).toBe('2027-10-27')
  })

  it('moves a missed schedule to the first future billing date', () => {
    const now = new Date('2026-11-03T03:30:00.000Z') // 9:00 AM in India
    expect(advanceBillingDay('2026-10-20', 'weekly', now)).toBe('2026-11-10')
    expect(advanceBillingDay('2026-06-03', 'monthly', now)).toBe('2026-12-03')
  })

  it('accepts only real billing days and known frequencies', () => {
    expect(isBillingDay('2026-02-30')).toBe(false)
    expect(isBillingDay('2026-02-28')).toBe(true)
    expect(isSubscriptionFrequency('monthly')).toBe(true)
    expect(isSubscriptionFrequency('daily')).toBe(false)
  })

  it('shows the India calendar day for a stored billing instant', () => {
    expect(billingDayLabel(new Date('2026-11-02T18:30:00.000Z'))).toBe('3 Nov 2026')
    expect(billingDayLabel('2026-11-03')).toBe('3 Nov 2026')
  })
})
