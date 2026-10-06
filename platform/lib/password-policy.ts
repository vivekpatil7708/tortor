// The one rule for new passwords (signup and reset), shared by the forms and
// the server so they always agree. Also used in the browser: no Node imports.

export const PASSWORD_RULE_TEXT = '8 to 72 characters, with an uppercase letter, a lowercase letter and a number'

/** Why a new password isn't allowed, or null if it's fine. */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters'
  // bcrypt only uses the first 72 bytes; anything longer would be silently cut off.
  if (new TextEncoder().encode(password).length > 72) return 'Password must be at most 72 characters'
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter'
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter'
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number'
  return null
}
