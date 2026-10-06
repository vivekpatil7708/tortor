import crypto from 'crypto'

/**
 * Password-reset links carry a random token; the database keeps only its
 * SHA-256 fingerprint, so someone who can read the database can't use a
 * pending reset link.
 */
export function newResetToken(): { token: string; stored: string } {
  const token = crypto.randomBytes(32).toString('hex')
  return { token, stored: hashResetToken(token) }
}

export function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}
