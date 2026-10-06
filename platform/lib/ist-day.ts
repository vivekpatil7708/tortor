// Calendar days as merchants see them: India is UTC+05:30 all year (no daylight saving).
const IST_OFFSET_MS = (5 * 60 + 30) * 60_000
const DAY_MS = 24 * 60 * 60_000
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** The moment a day in India (YYYY-MM-DD) begins, or null if `day` isn't a real date. */
export function istDayStart(day: string): Date | null {
  if (!DAY.test(day)) return null
  const utcMidnight = new Date(`${day}T00:00:00.000Z`)
  // Rejects dates like 2026-02-30 that would otherwise roll over into the next month.
  if (Number.isNaN(utcMidnight.getTime()) || utcMidnight.toISOString().slice(0, 10) !== day) return null
  return new Date(utcMidnight.getTime() - IST_OFFSET_MS)
}

/** The moment the next day begins in India: the (exclusive) end of `day`. */
export function istDayEnd(day: string): Date | null {
  const start = istDayStart(day)
  return start && new Date(start.getTime() + DAY_MS)
}
