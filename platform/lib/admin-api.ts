import { NextResponse } from 'next/server'
import { publicErrorMessage } from './api-response'

/**
 * The message shown when the database does not have the tables or columns the
 * admin APIs need. The broadcast tables are added by
 * prisma/migrations/add_broadcast_campaigns.sql.
 */
export const MISSING_MIGRATION_MESSAGE =
  'The database is missing tables or columns this page needs. Apply the pending SQL from prisma/migrations (for example add_broadcast_campaigns.sql) and try again.'

/**
 * Prisma codes that mean the database is behind the code's expectations.
 *
 * P2021 is "the table does not exist" (a migration was never run at all).
 * P2022 is "the column does not exist" (a table exists but a later migration
 * that adds a column was not run). Both are the same class of problem and the
 * admin needs the same instruction, so both are reported the same way. Only
 * handling P2021 meant a missing column surfaced as a bare 500 with no clue
 * about the cause.
 */
const MISSING_SCHEMA_CODES = new Set(['P2021', 'P2022'])

/** True when Prisma failed because a table or column is not there. */
export function isMissingSchema(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    MISSING_SCHEMA_CODES.has((err as { code?: unknown }).code as string)
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
