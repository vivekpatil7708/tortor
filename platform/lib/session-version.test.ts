import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { SignJWT, jwtVerify } from 'jose'

// Login checks (lib/auth.ts), password reset and "sign out other devices",
// with the cookie store and database replaced by fakes.
const SECRET = 'test-secret-for-session-version-tests'
process.env.JWT_SECRET = SECRET

const jar = vi.hoisted(() => new Map<string, string>())
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => { jar.set(name, value) },
    delete: (name: string) => { jar.delete(name) },
  }),
}))

const state = vi.hoisted(() => ({ version: 0 }))
const db = vi.hoisted(() => ({
  merchant: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

import { createSession, getSession } from '@/lib/auth'
import { POST as resetPassword } from '@/app/api/auth/reset-password/route'
import { POST as signOutOtherDevices } from '@/app/api/auth/logout-all/route'

const merchant = () => ({ id: 'm1', email: 'asha@example.com', status: 'active', sessionVersion: state.version })

async function loginToken(claims: Record<string, unknown>) {
  return new SignJWT({ sub: 'm1', email: 'asha@example.com', ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(SECRET))
}

async function versionInCookie() {
  const { payload } = await jwtVerify(jar.get('toropay_session') as string, new TextEncoder().encode(SECRET))
  return payload.sv
}

beforeEach(() => {
  vi.clearAllMocks()
  jar.clear()
  state.version = 0
  db.merchant.findUnique.mockImplementation(async () => merchant())
  db.merchant.update.mockImplementation(async ({ data }: { data: { sessionVersion?: { increment: number } } }) => {
    if (data.sessionVersion?.increment) state.version += data.sessionVersion.increment
    return merchant()
  })
})

describe('session version', () => {
  it('keeps logins made before this update working (no version counts as 0)', async () => {
    jar.set('toropay_session', await loginToken({}))
    const session = await getSession()
    expect(session?.id).toBe('m1')
    expect(session).not.toHaveProperty('sessionVersion')
  })

  it('accepts a login with the current version and refuses an older one', async () => {
    state.version = 2
    jar.set('toropay_session', await loginToken({ sv: 2 }))
    expect((await getSession())?.id).toBe('m1')

    jar.set('toropay_session', await loginToken({ sv: 1 }))
    expect(await getSession()).toBeNull()
  })

  it('stamps new logins with the current version', async () => {
    state.version = 3
    await createSession('m1', 'asha@example.com')
    expect(await versionInCookie()).toBe(3)
  })

  it('a password reset signs out every device', async () => {
    db.merchant.findFirst.mockResolvedValue(merchant())
    const req = new NextRequest('http://localhost/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: 'reset-token', password: 'NewPassw0rd' }),
    })

    const res = await resetPassword(req)

    expect(res.status).toBe(200)
    expect(db.merchant.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sessionVersion: { increment: 1 } }),
    }))
  })

  it('"sign out other devices" ends other logins but keeps this one', async () => {
    const otherDevice = await loginToken({ sv: 0 })
    jar.set('toropay_session', await loginToken({ sv: 0 }))

    const res = await signOutOtherDevices(new NextRequest('http://localhost/api/auth/logout-all', { method: 'POST' }))

    expect(res.status).toBe(200)
    expect(state.version).toBe(1)
    expect(await versionInCookie()).toBe(1)
    expect((await getSession())?.id).toBe('m1')

    jar.set('toropay_session', otherDevice)
    expect(await getSession()).toBeNull()
  })

  it('refuses "sign out other devices" without a login', async () => {
    const res = await signOutOtherDevices(new NextRequest('http://localhost/api/auth/logout-all', { method: 'POST' }))
    expect(res.status).toBe(401)
    expect(db.merchant.update).not.toHaveBeenCalled()
  })
})
