import { describe, expect, it } from 'vitest'
import { adminPage, readAdminListQuery } from './admin-query'

const params = (query: string) => new URLSearchParams(query)

describe('readAdminListQuery', () => {
  it('uses a default page size', () => {
    const result = readAdminListQuery(params(''))
    expect(result).toEqual({ limit: 50, cursor: undefined, filters: {} })
  })

  it('reads the page size', () => {
    const result = readAdminListQuery(params('limit=10'))
    expect(result).toEqual({ limit: 10, cursor: undefined, filters: {} })
  })

  it('rejects a page size that is not a number in range', () => {
    expect(readAdminListQuery(params('limit=0'))).toEqual({ error: 'limit must be 1 to 200' })
    expect(readAdminListQuery(params('limit=201'))).toEqual({ error: 'limit must be 1 to 200' })
    expect(readAdminListQuery(params('limit=many'))).toEqual({ error: 'limit must be 1 to 200' })
  })

  it('rejects a cursor that is not an id', () => {
    expect(readAdminListQuery(params('cursor=../etc'))).toEqual({ error: 'Invalid cursor' })
  })

  it('keeps a status the table has', () => {
    const result = readAdminListQuery(params('status=sent'), { statuses: ['sent', 'failed'] })
    expect(result).toEqual({ limit: 50, cursor: undefined, filters: { status: 'sent' } })
  })

  it('rejects a status the table does not have', () => {
    expect(readAdminListQuery(params('status=other'), { statuses: ['sent', 'failed'] }))
      .toEqual({ error: 'Unknown status' })
  })

  it('turns a date range into a filter on the given field', () => {
    const result = readAdminListQuery(params('from=2026-10-01&to=2026-10-06'), { dateField: 'createdAt' })
    expect('error' in result).toBe(false)
    const filters = (result as { filters: Record<string, unknown> }).filters
    const range = filters.createdAt as { gte: Date; lt: Date }
    expect(range.gte.toISOString()).toBe('2026-09-30T18:30:00.000Z')
    expect(range.lt.toISOString()).toBe('2026-10-06T18:30:00.000Z')
  })

  it('rejects a date that is not a date', () => {
    expect(readAdminListQuery(params('from=06-10-2026'), { dateField: 'createdAt' }))
      .toEqual({ error: 'Dates must look like 2026-10-06' })
  })

  it('turns a search term into a filter', () => {
    const result = readAdminListQuery(params('q=my store'), {
      search: (term) => ({ OR: [{ email: { contains: term, mode: 'insensitive' } }] }),
    })
    const filters = (result as { filters: Record<string, unknown> }).filters
    expect(filters.OR).toEqual([{ email: { contains: 'my store', mode: 'insensitive' } }])
  })

  it('rejects a search term that is too long', () => {
    expect(readAdminListQuery(params(`q=${'x'.repeat(65)}`), { search: () => ({}) }))
      .toEqual({ error: 'Search must be 64 characters or fewer' })
  })
})

describe('adminPage', () => {
  it('returns the rows of one page and the cursor for the next', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(adminPage(rows, 2)).toEqual({ page: [{ id: 'a' }, { id: 'b' }], nextCursor: 'b' })
  })

  it('has no next cursor on the last page', () => {
    expect(adminPage([{ id: 'a' }], 2)).toEqual({ page: [{ id: 'a' }], nextCursor: null })
  })
})
