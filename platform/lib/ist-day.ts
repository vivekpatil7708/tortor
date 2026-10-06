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

/** The day in India (YYYY-MM-DD) that a moment falls on, e.g. for charts. */
export function istDayKey(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

const MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/

function parseMoment(value: string): Date | null {
  if (!MOMENT.test(value)) return null
  const at = new Date(value)
  return Number.isNaN(at.getTime()) ? null : at
}

/**
 * A created-at filter from `from` / `to` values: a plain date (2026-10-06) means
 * that whole day in India, and a full timestamp with a time zone is used as it
 * is. Null if either value is neither.
 */
export function createdAtRange(from: string | null, to: string | null): { gte?: Date; lt?: Date; lte?: Date } | null {
  const range: { gte?: Date; lt?: Date; lte?: Date } = {}
  if (from) {
    const start = DAY.test(from) ? istDayStart(from) : parseMoment(from)
    if (!start) return null
    range.gte = start
  }
  if (to) {
    if (DAY.test(to)) {
      const end = istDayEnd(to)
      if (!end) return null
      range.lt = end
    } else {
      const at = parseMoment(to)
      if (!at) return null
      range.lte = at
    }
  }
  return range
}
