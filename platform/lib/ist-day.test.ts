import { describe, expect, it } from 'vitest'
import { istDayEnd, istDayStart } from './ist-day'

describe('days in Indian time (B5, and B7 later)', () => {
  it('runs 6 October from 18:30 UTC on 5 October for 24 hours', () => {
    expect(istDayStart('2026-10-06')?.toISOString()).toBe('2026-10-05T18:30:00.000Z')
    expect(istDayEnd('2026-10-06')?.toISOString()).toBe('2026-10-06T18:30:00.000Z')
  })

  it('counts a payment at 2 AM IST on the day it happened in India', () => {
    const twoAmIst = new Date('2026-10-05T20:30:00Z')
    expect(twoAmIst >= istDayStart('2026-10-06')! && twoAmIst < istDayEnd('2026-10-06')!).toBe(true)
    expect(twoAmIst < istDayEnd('2026-10-05')!).toBe(false)
  })

  it('handles month, year and leap-day boundaries', () => {
    expect(istDayStart('2026-01-01')?.toISOString()).toBe('2025-12-31T18:30:00.000Z')
    expect(istDayEnd('2026-12-31')?.toISOString()).toBe('2026-12-31T18:30:00.000Z')
    expect(istDayStart('2028-02-29')?.toISOString()).toBe('2028-02-28T18:30:00.000Z')
  })

  it('rejects anything that is not a real date', () => {
    for (const bad of ['2026-02-30', '2027-02-29', '2026-13-01', '2026-10-6', '06-10-2026', '', 'yesterday', '2026-10-06T00:00']) {
      expect(istDayStart(bad)).toBeNull()
      expect(istDayEnd(bad)).toBeNull()
    }
  })
})
