import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { istDayEnd, istDayStart } from './ist-day'

/**
 * Who a campaign goes to. Kept as JSON on the campaign so a new filter can be
 * added without a migration, and parsed here so a bad spec is rejected before
 * it reaches the database.
 */
export const audienceSchema = z.object({
  /** Merchant status, e.g. "active" or "suspended". */
  status: z.string().trim().min(1).max(40).optional(),
  onboardingComplete: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
  /** Signed up on or after this day (YYYY-MM-DD, India). */
  createdFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Signed up on or before this day (YYYY-MM-DD, India). */
  createdTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  minTransactions: z.number().int().min(0).max(1_000_000).optional(),
  maxTransactions: z.number().int().min(0).max(1_000_000).optional(),
  /** Merchants picked by hand. They are added to whoever the filters match. */
  merchantIds: z.array(z.string().trim().min(1)).max(5000).optional(),
})

export type Audience = z.infer<typeof audienceSchema>

export const DEFAULT_AUDIENCE: Audience = { status: 'active' }

/** The parsed audience of a campaign, or the problem with it. */
export function parseAudience(json: string | null | undefined): { ok: true; audience: Audience } | { ok: false; error: string } {
  if (!json || !json.trim()) return { ok: true, audience: { ...DEFAULT_AUDIENCE } }
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return { ok: false, error: 'The audience could not be read' }
  }
  const result = audienceSchema.safeParse(raw)
  if (!result.success) {
    const first = result.error.issues[0]
    return { ok: false, error: first ? `${first.path.join('.') || 'audience'}: ${first.message}` : 'The audience is not valid' }
  }
  if (result.data.minTransactions !== undefined && result.data.maxTransactions !== undefined) {
    if (result.data.minTransactions > result.data.maxTransactions) {
      return { ok: false, error: 'The smallest number of transactions is larger than the largest' }
    }
  }
  return { ok: true, audience: result.data }
}

/** The audience of a campaign, or the default one when it cannot be read. */
export function audienceOf(campaign: { audience: string | null }): Audience {
  const parsed = parseAudience(campaign.audience)
  return parsed.ok ? parsed.audience : { ...DEFAULT_AUDIENCE }
}

/**
 * The merchants an audience matches. Hand-picked merchants are added to
 * whoever the filters match, so an admin can always add one extra recipient
 * to a campaign without changing the filters.
 */
export function audienceWhere(audience: Audience): Prisma.MerchantWhereInput {
  const filters: Prisma.MerchantWhereInput = {}

  if (audience.status) filters.status = audience.status
  if (audience.onboardingComplete !== undefined) filters.onboardingComplete = audience.onboardingComplete
  if (audience.emailVerified !== undefined) {
    filters.emailVerifiedAt = audience.emailVerified ? { not: null } : null
  }

  if (audience.createdFrom) {
    const start = istDayStart(audience.createdFrom)
    if (start) filters.createdAt = { ...(filters.createdAt as object), gte: start }
  }
  if (audience.createdTo) {
    const end = istDayEnd(audience.createdTo)
    if (end) filters.createdAt = { ...(filters.createdAt as object), lt: end }
  }

  if (audience.merchantIds && audience.merchantIds.length > 0) {
    return { OR: [filters, { id: { in: audience.merchantIds } }] }
  }
  return filters
}

/**
 * The number of payments an audience is limited to, or null when it is not
 * limited. Prisma cannot filter a relation by how many rows it has, so this
 * part of the audience is applied with a query of its own.
 */
export function transactionCountFilter(audience: Audience): { min?: number; max?: number } | null {
  if (audience.minTransactions === undefined && audience.maxTransactions === undefined) return null
  return {
    ...(audience.minTransactions !== undefined ? { min: audience.minTransactions } : {}),
    ...(audience.maxTransactions !== undefined ? { max: audience.maxTransactions } : {}),
  }
}

/** A short description of an audience, for the campaign list. */
export function describeAudience(audience: Audience): string {
  const parts: string[] = []
  if (audience.status) parts.push(audience.status)
  if (audience.onboardingComplete) parts.push('onboarded')
  if (audience.emailVerified) parts.push('verified email')
  if (audience.createdFrom || audience.createdTo) {
    parts.push(`joined ${audience.createdFrom || 'any'} to ${audience.createdTo || 'now'}`)
  }
  if (audience.minTransactions !== undefined) parts.push(`at least ${audience.minTransactions} payments`)
  if (audience.maxTransactions !== undefined) parts.push(`at most ${audience.maxTransactions} payments`)
  if (audience.merchantIds?.length) parts.push(`${audience.merchantIds.length} picked`)
  return parts.length ? parts.join(', ') : 'everyone'
}
