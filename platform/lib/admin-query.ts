import { createdAtRange } from './ist-day'

// Shared list rules for the admin tables: a page of rows at a time, a filter
// on the status, a date range and a search term. Every admin list that grows
// without bound uses these, so none of them fetch the whole table first.

const MAX_LIMIT = 200
const DEFAULT_LIMIT = 50
const MAX_SEARCH = 64
const ID = /^[A-Za-z0-9-]{1,64}$/

export interface AdminListQuery {
  limit: number
  cursor?: string
  filters: Record<string, unknown>
}

export interface AdminListOptions {
  /** The statuses the table has. A status outside this list is an error. */
  statuses?: readonly string[]
  /** The field the date range applies to, e.g. "createdAt". */
  dateField?: string
  /** The filter a search term turns into. */
  search?: (term: string) => Record<string, unknown>
}

/** The parsed list query, or the problem with it. */
export function readAdminListQuery(
  params: URLSearchParams,
  options: AdminListOptions = {}
): AdminListQuery | { error: string } {
  const rawLimit = params.get('limit')
  const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return { error: `limit must be 1 to ${MAX_LIMIT}` }

  const cursor = params.get('cursor') || undefined
  if (cursor && !ID.test(cursor)) return { error: 'Invalid cursor' }

  const filters: Record<string, unknown> = {}

  const status = params.get('status')
  if (status) {
    if (options.statuses && !options.statuses.includes(status)) return { error: 'Unknown status' }
    filters.status = status
  }

  if (options.dateField) {
    const range = createdAtRange(params.get('from'), params.get('to'))
    if (!range) return { error: 'Dates must look like 2026-10-06' }
    if (Object.keys(range).length > 0) filters[options.dateField] = range
  }

  const q = (params.get('q') || '').trim()
  if (q) {
    if (q.length > MAX_SEARCH) return { error: `Search must be ${MAX_SEARCH} characters or fewer` }
    if (options.search) Object.assign(filters, options.search(q))
  }

  return { limit, cursor, filters }
}

/** The rows of one page, and the cursor for the next one. */
export function adminPage<T extends { id: string }>(rows: T[], limit: number): { page: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  return { page, nextCursor: hasMore ? page[page.length - 1].id : null }
}
