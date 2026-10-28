import { istDayKey } from './ist-day'

// Subscription plans are billed on calendar days as merchants see them in India.
// Keeping the arithmetic on YYYY-MM-DD strings avoids timezone drift when a
// billing date is stored as the start of that day in IST.

export const SUBSCRIPTION_FREQUENCIES = ['weekly', 'monthly', 'yearly'] as const
export type SubscriptionFrequency = (typeof SUBSCRIPTION_FREQUENCIES)[number]

export const SUBSCRIPTION_STATUSES = ['active', 'paused', 'cancelled'] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

export const SUBSCRIPTION_FREQUENCY_LABELS: Record<SubscriptionFrequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

type DayParts = { year: number; month: number; day: number }

function dayParts(day: string): DayParts | null {
  if (!DAY.test(day)) return null
  const [year, month, date] = day.split('-').map(Number)
  const check = new Date(Date.UTC(year, month - 1, date))
  if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== day) return null
  return { year, month, day: date }
}

function formatDay({ year, month, day }: DayParts): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function isSubscriptionFrequency(value: unknown): value is SubscriptionFrequency {
  return typeof value === 'string' && (SUBSCRIPTION_FREQUENCIES as readonly string[]).includes(value)
}

export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === 'string' && (SUBSCRIPTION_STATUSES as readonly string[]).includes(value)
}

/** Add a whole number of calendar days to a YYYY-MM-DD day. */
export function addDaysToDay(day: string, days: number): string {
  const parts = dayParts(day)
  if (!parts) throw new Error(`Invalid day: ${day}`)
  const at = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
  return at.toISOString().slice(0, 10)
}

/** Add months, clamping to the last day when the target month is shorter. */
function addMonthsToDay(day: string, months: number): string {
  const parts = dayParts(day)
  if (!parts) throw new Error(`Invalid day: ${day}`)
  const firstOfTarget = new Date(Date.UTC(parts.year, parts.month - 1 + months, 1))
  const lastDayOfTarget = new Date(
    Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0),
  ).getUTCDate()
  return formatDay({
    year: firstOfTarget.getUTCFullYear(),
    month: firstOfTarget.getUTCMonth() + 1,
    day: Math.min(parts.day, lastDayOfTarget),
  })
}

/** The next billing day after `day` for a weekly, monthly or yearly plan. */
export function addBillingFrequency(day: string, frequency: SubscriptionFrequency): string {
  switch (frequency) {
    case 'weekly':
      return addDaysToDay(day, 7)
    case 'monthly':
      return addMonthsToDay(day, 1)
    case 'yearly':
      return addMonthsToDay(day, 12)
  }
}

/**
 * The next future billing day after a subscription has been billed. If the cron
 * missed a few runs, skipped periods are not billed retroactively; the schedule
 * simply resumes at the next date after today.
 */
export function advanceBillingDay(day: string, frequency: SubscriptionFrequency, now = new Date()): string {
  const today = istDayKey(now)
  let next = addBillingFrequency(day, frequency)
  // A hard stop guards against a malformed row turning this into an endless loop.
  for (let i = 0; next <= today && i < 600; i += 1) {
    next = addBillingFrequency(next, frequency)
  }
  return next
}

/** Whether a date-only input is a real calendar day. */
export function isBillingDay(value: unknown): value is string {
  return typeof value === 'string' && dayParts(value) !== null
}

export function frequencyLabel(frequency: string): string {
  return isSubscriptionFrequency(frequency) ? SUBSCRIPTION_FREQUENCY_LABELS[frequency] : frequency
}

/** Display a billing day or stored billing instant as a date in India. */
export function billingDayLabel(value: string | Date): string {
  const day =
    typeof value === 'string' && DAY.test(value)
      ? value
      : istDayKey(typeof value === 'string' ? new Date(value) : value)
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
