import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignJWT, jwtVerify } from 'jose'

const SECRET = 'test-secret-for-team-session-tests'
process.env.JWT_SECRET = SECRET

const jar = vi.hoisted(() => new Map<string, string>())
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => { jar.set(name, value) },
    delete: (name: string) => { jar.delete(name) },
  }),
}))

const state = vi.hoisted(() => ({ accountVersion: 0, targetStatus: 'active' }))
const db = vi.hoisted(() => ({
  merchant: { findUnique: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

import { createSession, getSession } from '@/lib/auth'

const account = () => ({
  id: 'a1',
  email: 'asha@example.com',
  name: 'Asha',
  status: 'active',
  sessionVersion: state.accountVersion,
  businessName: 'Asha Studio',
  createdAt: new Date('2026-01-01T00:00:00Z'),
})

const target = () => ({
  id: 'm1',
  email: 'owner@example.com',
  name: 'Owner',
  status: state.targetStatus,
  sessionVersion: 0,
  businessName: 'Asha Crafts',
  createdAt: new Date('2026-01-01T00:00:00Z'),
})

async function token(claims: Record<string, unknown>, sub = 'a1') {
  return new SignJWT({ email: 'asha@example.com', ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(SECRET))
}

beforeEach(() => {
  vi.clearAllMocks()
  jar.clear()
  state.accountVersion = 0
  state.targetStatus = 'active'
  db.merchant.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    if (where.id === 'a1') return account()
    if (where.id === 'm1') return target()
    return null
  })
})

describe('team sessions', () => {
  it('opens the inviting merchant dashboard for a team member', async () => {
    jar.set('toropay_session', await token({ mid: 'm1', role: 'admin', tmid: 'tm1', tname: 'Asha', sv: 0 }))

    const session = await getSession()

    expect(session).toMatchObject({
      id: 'm1',
      businessName: 'Asha Crafts',
      accountId: 'a1',
      accountEmail: 'asha@example.com',
      teamRole: 'admin',
      teamMemberId: 'tm1',
      teamMemberName: 'Asha',
      isTeamMember: true,
    })
    expect(session).not.toHaveProperty('sessionVersion')
  })

  it('opens the account own merchant for an owner login', async () => {
    jar.set('toropay_session', await token({ sv: 0 }))

    const session = await getSession()

    expect(session).toMatchObject({ id: 'a1', accountId: 'a1', teamRole: 'owner', isTeamMember: false })
  })

  it('treats a login from before team access as an owner session', async () => {
    jar.set('toropay_session', await token({}))

    expect(await getSession()).toMatchObject({ id: 'a1', teamRole: 'owner', teamMemberId: null })
  })

  it('refuses a team session after the member session version is raised', async () => {
    state.accountVersion = 1
    jar.set('toropay_session', await token({ mid: 'm1', role: 'admin', tmid: 'tm1', sv: 0 }))

    expect(await getSession()).toBeNull()
  })

  it('refuses a team session when the inviting merchant is suspended', async () => {
    state.targetStatus = 'suspended'
    jar.set('toropay_session', await token({ mid: 'm1', role: 'admin', tmid: 'tm1', sv: 0 }))

    expect(await getSession()).toBeNull()
  })

  it('mints a login with the effective merchant and role claims', async () => {
    await createSession('a1', 'asha@example.com', {
      team: { merchantId: 'm1', teamMemberId: 'tm1', role: 'viewer', name: 'Asha' },
    })

    const { payload } = await jwtVerify(jar.get('toropay_session') as string, new TextEncoder().encode(SECRET))
    expect(payload).toMatchObject({
      sub: 'a1',
      email: 'asha@example.com',
      mid: 'm1',
      role: 'viewer',
      tmid: 'tm1',
      tname: 'Asha',
      sv: 0,
    })
  })
})
