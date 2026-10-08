// Optional limits on a payment link: stop after a number of paid payments, or
// after a day. Used by the New link form and checked again on the server.
import { istDayEnd, istDayKey } from './ist-day'

export const MAX_USES_LIMIT = 100_000

/** The form's problem with the limits it was given, or '' when they're fine. */
export function limitsProblem(maxUses: string, expiresOn: string, now = new Date()): string {
  if (maxUses.trim()) {
    const n = Number(maxUses)
    if (!Number.isInteger(n) || n < 1 || n > MAX_USES_LIMIT) return 'Stop after: enter a whole number from 1 to 1,00,000'
  }
  if (expiresOn) {
    if (!istDayEnd(expiresOn)) return 'Expires on: choose a date'
    if (expiresOn < istDayKey(now)) return 'Expires on: choose today or a later date'
  }
  return ''
}

/** A link set to expire "on" a day works until that day ends in India. */
export function expiryMoment(expiresOn: string): string | null {
  return expiresOn ? istDayEnd(expiresOn)?.toISOString() ?? null : null
}

/** The form's problem with a customer-entered amount's optional minimum and maximum. */
export function rangeProblem(min: string, max: string): string {
  const lo = min.trim() ? Number(min) : null
  const hi = max.trim() ? Number(max) : null
  if (lo !== null && !(lo > 0)) return 'Minimum must be more than ₹0'
  if (hi !== null && !(hi > 0)) return 'Maximum must be more than ₹0'
  if (lo !== null && hi !== null && lo > hi) return "The minimum can't be more than the maximum"
  return ''
}

export type LinkLimits = { ok: true; maxUses: number | null; expiryAt: Date | null } | { ok: false; error: string }

/** The server's check of the limits sent with a new link (from the form or the API). */
export function linkLimitsInput(maxUses: unknown, expiryAt: unknown, now = Date.now()): LinkLimits {
  let uses: number | null = null
  if (maxUses !== undefined && maxUses !== null && maxUses !== '') {
    const n = Number(maxUses)
    if (!Number.isInteger(n) || n < 1 || n > MAX_USES_LIMIT) {
      return { ok: false, error: 'max_uses must be a whole number from 1 to 100000' }
    }
    uses = n
  }
  let expiry: Date | null = null
  if (expiryAt !== undefined && expiryAt !== null && expiryAt !== '') {
    const at = new Date(String(expiryAt))
    if (Number.isNaN(at.getTime())) return { ok: false, error: 'expiry_at must be a date and time' }
    if (at.getTime() <= now) return { ok: false, error: 'expiry_at must be in the future' }
    expiry = at
  }
  return { ok: true, maxUses: uses, expiryAt: expiry }
}
