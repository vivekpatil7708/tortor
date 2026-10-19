import { describe, expect, it } from 'vitest'
import { orderSearchWhere, readOrderQuery } from './order-query'

/** A URLSearchParams from a plain object, the way a request would arrive. */
const params = (q: Record<string, string>) => new URLSearchParams(q)

describe('readOrderQuery', () => {
  it('defaults to 50 per page with no filters', () => {
    const q = readOrderQuery(params({}))
    expect(q).toEqual({ limit: 50, cursor: undefined, filters: {} })
  })

  it('rejects a limit outside the allowed range', () => {
    expect(readOrderQuery(params({ limit: '0' }))).toEqual({ error: 'limit must be 1 to 200' })
    expect(readOrderQuery(params({ limit: '201' }))).toEqual({ error: 'limit must be 1 to 200' })
    expect(readOrderQuery(params({ limit: 'abc' }))).toEqual({ error: 'limit must be 1 to 200' })
  })

  it('accepts the edges of the range', () => {
    expect(readOrderQuery(params({ limit: '1' }))).toMatchObject({ limit: 1 })
    expect(readOrderQuery(params({ limit: '200' }))).toMatchObject({ limit: 200 })
  })

  it('rejects a cursor that is not an id', () => {
    expect(readOrderQuery(params({ cursor: 'drop table' }))).toEqual({ error: 'Invalid cursor' })
  })

  it('accepts a uuid cursor', () => {
    const id = '3f1a2b4c-5d6e-7f80-9a0b-1c2d3e4f5061'
    expect(readOrderQuery(params({ cursor: id }))).toMatchObject({ cursor: id })
  })

  it('maps each status filter onto the right column', () => {
    const q = readOrderQuery(params({
      payment_status: 'paid',
      order_status: 'completed',
      fulfillment_status: 'delivered',
      source: 'payment_link',
    }))
    expect(q).toMatchObject({
      filters: {
        paymentStatus: 'paid',
        orderStatus: 'completed',
        fulfillmentSummaryStatus: 'delivered',
        source: 'payment_link',
      },
    })
  })

  it('rejects a status it does not recognise rather than ignoring it', () => {
    // Silently dropping an unknown filter would show every order and look like
    // the filter simply matched them all.
    expect(readOrderQuery(params({ payment_status: 'refundd' }))).toEqual({ error: 'Unknown payment status' })
    expect(readOrderQuery(params({ order_status: 'shipped' }))).toEqual({ error: 'Unknown order status' })
    expect(readOrderQuery(params({ fulfillment_status: 'lost' }))).toEqual({ error: 'Unknown fulfillment status' })
    expect(readOrderQuery(params({ source: 'amazon' }))).toEqual({ error: 'Unknown source' })
  })

  it('treats the whole of a day as India time, so the end date is inclusive', () => {
    const q = readOrderQuery(params({ from: '2026-10-06', to: '2026-10-06' }))
    if ('error' in q) throw new Error(q.error)
    const range = q.filters.createdAt as { gte?: Date; lt?: Date }
    // Start of 6 Oct and start of 7 Oct in India (UTC+5:30).
    expect(range.gte?.toISOString()).toBe('2026-10-05T18:30:00.000Z')
    expect(range.lt?.toISOString()).toBe('2026-10-06T18:30:00.000Z')
  })

  it('rejects a date that is not a plain calendar day', () => {
    expect(readOrderQuery(params({ from: 'yesterday' }))).toEqual({ error: 'Dates must look like 2026-10-06' })
  })

  it('caps the search length', () => {
    expect(readOrderQuery(params({ q: 'x'.repeat(65) }))).toEqual({ error: 'Search must be 64 characters or fewer' })
  })

  it('ignores an empty search rather than filtering everything out', () => {
    expect(readOrderQuery(params({ q: '   ' }))).toMatchObject({ filters: {} })
  })

  it('searches several fields at once', () => {
    const q = readOrderQuery(params({ q: 'TP-2026' }))
    if ('error' in q) throw new Error(q.error)
    expect(q.filters.OR).toBeDefined()
    expect((q.filters.OR as unknown[]).length).toBe(6)
  })
})

describe('orderSearchWhere', () => {
  it('matches the order number, reference and note', () => {
    const where = orderSearchWhere('TP-1')
    const or = where.OR as Record<string, unknown>[]
    expect(or).toContainEqual({ orderNumber: { contains: 'TP-1', mode: 'insensitive' } })
    expect(or).toContainEqual({ merchantOrderReference: { contains: 'TP-1', mode: 'insensitive' } })
    expect(or).toContainEqual({ customerNote: { contains: 'TP-1', mode: 'insensitive' } })
  })

  it('matches against the customer fields', () => {
    const where = orderSearchWhere('Asha')
    const or = where.OR as Record<string, unknown>[]
    expect(or).toContainEqual({ customer: { is: { fullName: { contains: 'Asha', mode: 'insensitive' } } } })
    expect(or).toContainEqual({ customer: { is: { email: { contains: 'Asha', mode: 'insensitive' } } } })
    expect(or).toContainEqual({ customer: { is: { phone: { contains: 'Asha' } } } })
  })
})
