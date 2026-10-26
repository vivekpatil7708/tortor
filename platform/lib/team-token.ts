import { createHash, randomBytes } from 'node:crypto'

/** How long an invitation stays usable. */
export const TEAM_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * The invitation email carries `token`; the database stores only `tokenHash`.
 * A leaked database therefore cannot be used to accept pending invitations.
 */
export function createInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashInviteToken(token) }
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
