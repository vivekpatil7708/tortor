import { describe, expect, it } from 'vitest'
import { createInviteToken, hashInviteToken, TEAM_INVITE_TTL_MS } from '@/lib/team-token'

describe('team invitation tokens', () => {
  it('stores only a fingerprint, not the emailed token', () => {
    const { token, tokenHash } = createInviteToken()
    expect(token).not.toBe(tokenHash)
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(hashInviteToken(token)).toBe(tokenHash)
  })

  it('creates a new unguessable token each time', () => {
    const first = createInviteToken()
    const second = createInviteToken()
    expect(first.token).not.toBe(second.token)
    expect(first.tokenHash).not.toBe(second.tokenHash)
    expect(first.token.length).toBeGreaterThanOrEqual(40)
  })

  it('keeps invitations valid for seven days', () => {
    expect(TEAM_INVITE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })
})
