/** The states a feedback response can be in. */
export const FEEDBACK_STATUSES = ['new', 'reviewed', 'actioned'] as const
export type FeedbackStatus = typeof FEEDBACK_STATUSES[number]

/**
 * The useful parts a response names, stored as a JSON array. A row written by
 * an older version may hold something else, and it must not take the whole
 * inbox down.
 */
export function safeUsefulParts(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter(part => typeof part === 'string') : []
  } catch {
    return []
  }
}
