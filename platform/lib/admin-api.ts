import { NextResponse } from 'next/server'
import { publicErrorMessage } from './api-response'

/**
 * The message shown when the database does not have the broadcast tables yet.
 * They are added by prisma/migrations/add_broadcast_campaigns.sql.
 */
export const MISSING_MIGRATION_MESSAGE =
  'The database is missing the broadcast tables. Apply prisma/migrations/add_broadcast_campaigns.sql and try again.'

/** True when Prisma failed because a table or column is not there. */
export function isMissingSchema(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2021'
  )
}

/**
 * The answer to an admin request that failed. A missing table is reported as
 * something the admin can act on, not as a generic error.
 */
export function adminErrorResponse(err: unknown, fallback = 'Error') {
  const msg = publicErrorMessage(err, fallback)
  if (msg === 'Forbidden') return NextResponse.json({ error: msg }, { status: 403 })
  if (msg === 'Unauthorized') return NextResponse.json({ error: msg }, { status: 401 })
  if (isMissingSchema(err)) return NextResponse.json({ error: MISSING_MIGRATION_MESSAGE }, { status: 503 })
  return NextResponse.json({ error: msg }, { status: 500 })
}
