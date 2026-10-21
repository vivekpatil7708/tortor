import { describe, expect, it } from 'vitest'
import { audienceWhere, describeAudience, parseAudience, transactionCountFilter } from './broadcast-audience'

describe('parseAudience', () => {
  it('uses the default audience for an empty spec', () => {
    const result = parseAudience('')
    expect(result).toEqual({ ok: true, audience: { status: 'active' } })
  })

  it('reads a spec that was stored as JSON', () => {
    const result = parseAudience(JSON.stringify({ status: 'suspended', minTransactions: 3 }))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.audience.status).toBe('suspended')
      expect(result.audience.minTransactions).toBe(3)
    }
  })

  it('rejects text that is not JSON', () => {
    const result = parseAudience('not json')
    expect(result.ok).toBe(false)
  })

  it('rejects a spec with the wrong shape', () => {
    const result = parseAudience(JSON.stringify({ minTransactions: 'lots' }))
    expect(result.ok).toBe(false)
  })

  it('rejects a day that is not a date', () => {
    const result = parseAudience(JSON.stringify({ createdFrom: '06-10-2026' }))
    expect(result.ok).toBe(false)
  })

  it('rejects a range that cannot be met', () => {
    const result = parseAudience(JSON.stringify({ minTransactions: 10, maxTransactions: 2 }))
    expect(result.ok).toBe(false)
  })
})

describe('audienceWhere', () => {
  it('matches the status', () => {
    expect(audienceWhere({ status: 'suspended' })).toEqual({ status: 'suspended' })
  })

  it('matches a verified email either way', () => {
    expect(audienceWhere({ emailVerified: true })).toEqual({ emailVerifiedAt: { not: null } })
    expect(audienceWhere({ emailVerified: false })).toEqual({ emailVerifiedAt: null })
  })

  it('matches a range of sign-up days in India', () => {
    const where = audienceWhere({ createdFrom: '2026-10-01', createdTo: '2026-10-06' })
    const createdAt = where.createdAt as { gte: Date; lt: Date }
    expect(createdAt.gte.toISOString()).toBe('2026-09-30T18:30:00.000Z')
    expect(createdAt.lt.toISOString()).toBe('2026-10-06T18:30:00.000Z')
  })

  it('leaves the number of payments out of the filter, which is applied on its own', () => {
    expect(audienceWhere({ minTransactions: 1 })).toEqual({})
    expect(transactionCountFilter({ minTransactions: 1 })).toEqual({ min: 1 })
    expect(transactionCountFilter({ minTransactions: 1, maxTransactions: 10 })).toEqual({ min: 1, max: 10 })
    expect(transactionCountFilter({})).toBeNull()
  })

  it('adds hand-picked merchants to whoever the filters match', () => {
    const where = audienceWhere({ status: 'active', merchantIds: ['m1', 'm2'] })
    expect(where.OR).toEqual([
      { status: 'active' },
      { id: { in: ['m1', 'm2'] } },
    ])
  })
})

describe('describeAudience', () => {
  it('says who the campaign goes to', () => {
    expect(describeAudience({ status: 'active', onboardingComplete: true, emailVerified: true }))
      .toBe('active, onboarded, verified email')
  })

  it('counts the hand-picked merchants', () => {
    expect(describeAudience({ merchantIds: ['a', 'b', 'c'] })).toBe('3 picked')
  })

  it('says everyone when nothing is set', () => {
    expect(describeAudience({})).toBe('everyone')
  })
})
