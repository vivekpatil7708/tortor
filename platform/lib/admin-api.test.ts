import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isMissingSchema, MISSING_MIGRATION_MESSAGE, adminErrorResponse } from './admin-api'

// The admin error mapper. The relevant failure is a database that is behind the
// code - either a table that was never created (P2021) or a column a later
// migration adds (P2022). Both must reach the admin as something to act on.

/** A Prisma error shaped like the real one: an Error carrying a `code`. */
function prismaError(code: string, message: string) {
  return Object.assign(new Error(message), { code })
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('isMissingSchema', () => {
  it('is true for a missing table', () => {
    const err = prismaError('P2021', 'The table `broadcast_campaigns` does not exist in the current database.')
    expect(isMissingSchema(err)).toBe(true)
  })

  it('is true for a missing column', () => {
    // A table exists but a migration that adds a column was not run. This used
    // to fall through as a generic 500, which told the admin nothing.
    const err = prismaError('P2022', 'The column `merchants.email_verified_at` does not exist in the current database.')
    expect(isMissingSchema(err)).toBe(true)
  })

  it('is false for other Prisma codes', () => {
    expect(isMissingSchema(prismaError('P2002', 'Unique constraint failed'))).toBe(false)
    expect(isMissingSchema(prismaError('P1001', 'Cannot reach database server'))).toBe(false)
  })

  it('is false for values that are not a Prisma error', () => {
    expect(isMissingSchema(new Error('Order not found'))).toBe(false)
    expect(isMissingSchema(null)).toBe(false)
    expect(isMissingSchema(undefined)).toBe(false)
    expect(isMissingSchema('P2022')).toBe(false)
    expect(isMissingSchema({ message: 'no code here' })).toBe(false)
  })
})

describe('adminErrorResponse', () => {
  it('reports a missing table as an actionable 503', async () => {
    const res = adminErrorResponse(prismaError('P2021', 'The table `broadcast_campaigns` does not exist.'))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: MISSING_MIGRATION_MESSAGE })
  })

  it('reports a missing column as an actionable 503 too', async () => {
    const res = adminErrorResponse(prismaError('P2022', 'The column `x` does not exist.'))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: MISSING_MIGRATION_MESSAGE })
  })

  it('keeps Forbidden and Unauthorized taking precedence', async () => {
    for (const [message, status] of [['Forbidden', 403], ['Unauthorized', 401]] as const) {
      const res = adminErrorResponse(new Error(message))
      expect(res.status).toBe(status)
      expect(await res.json()).toEqual({ error: message })
    }
  })

  it('keeps an intentional error message, as a 500', async () => {
    const res = adminErrorResponse(new Error('Order not found'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Order not found' })
  })

  it('hides the details of an unexpected error behind the generic message', async () => {
    // An error with a `code` (e.g. a network/database error) is treated as
    // unexpected by publicErrorMessage and gets replaced with the generic text.
    const err = Object.assign(new Error('Connection terminated unexpectedly'), { code: 'ECONNRESET' })
    const res = adminErrorResponse(err)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Something went wrong. Please try again.' })
  })

  it('uses the caller fallback for a non-Error value', async () => {
    const res = adminErrorResponse('a thrown string', 'Broadcast failed')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Broadcast failed' })
  })
})
