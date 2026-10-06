import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Login and signup answer the same way whether or not an account exists.
// Database, password checks and rate limits are replaced by fakes.
const db = vi.hoisted(() => ({
  auditLog: { count: vi.fn(), create: vi.fn() },
  merchant: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
}))
const auth = vi.hoisted(() => ({
  verifyPassword: vi.fn(),
  createSession: vi.fn(),
  clearImpersonation: vi.fn(),
  hashPassword: vi.fn(async () => 'hash'),
  merchantToJson: vi.fn((m: unknown) => m),
}))
const limits = vi.hoisted(() => ({ isRateLimited: vi.fn(), recordAttempt: vi.fn(), clientIp: vi.fn(() => '1.2.3.4') }))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/auth', () => auth)
vi.mock('@/lib/rate-limit', () => limits)
vi.mock('@/lib/email-verification', () => ({ sendVerificationEmail: vi.fn(async () => true) }))

import { POST as login } from '@/app/api/auth/login/route'
import { POST as signup } from '@/app/api/auth/signup/route'

const post = (handler: (req: NextRequest) => Promise<Response>, body: Record<string, unknown>) =>
  handler(new NextRequest('http://localhost/api/x', { method: 'POST', body: JSON.stringify(body) }))
  .then(async res => ({ status: res.status, body: await res.json() }))

beforeEach(() => {
  vi.clearAllMocks()
  limits.isRateLimited.mockResolvedValue(false)
  db.auditLog.count.mockResolvedValue(0)
  auth.verifyPassword.mockResolvedValue(false)
  db.merchant.update.mockResolvedValue({ loginAttempts: 1 })
})

describe('login does not reveal which emails have accounts', () => {
  const attempt = { email: 'someone@example.com', password: 'Wrong-pass1' }

  it('gives the same answer for an unknown email, a Google-only account and a wrong password', async () => {
    db.merchant.findUnique.mockResolvedValue(null)
    const unknown = await post(login, attempt)

    db.merchant.findUnique.mockResolvedValue({ id: 'm1', email: attempt.email, passwordHash: null, lockedUntil: null })
    const googleOnly = await post(login, attempt)

    db.merchant.findUnique.mockResolvedValue({ id: 'm1', email: attempt.email, passwordHash: 'real-hash', lockedUntil: null })
    const wrongPassword = await post(login, attempt)

    for (const res of [unknown, googleOnly, wrongPassword]) {
      expect(res).toEqual({ status: 401, body: { error: 'Invalid email or password' } })
    }
  })

  it('runs a password check even when there is no account, so timing gives nothing away', async () => {
    db.merchant.findUnique.mockResolvedValue(null)
    await post(login, attempt)
    expect(auth.verifyPassword).toHaveBeenCalledTimes(1)
    expect(auth.verifyPassword.mock.calls[0][1]).toMatch(/^\$2[aby]\$12\$/)
  })

  it('locks out an unknown email after 5 failures exactly like a real, locked account', async () => {
    db.auditLog.count.mockResolvedValue(5)
    db.merchant.findUnique.mockResolvedValue(null)
    const unknown = await post(login, attempt)

    db.auditLog.count.mockResolvedValue(0)
    db.merchant.findUnique.mockResolvedValue({ id: 'm1', email: attempt.email, passwordHash: 'h', lockedUntil: new Date(Date.now() + 600_000) })
    const locked = await post(login, attempt)

    expect(unknown.status).toBe(429)
    expect(locked).toEqual(unknown)
  })
})

describe('signup', () => {
  const details = { email: 'asha@example.com', phone: '9876543210', password: 'Toropay2026' }

  it('answers a duplicate without saying an account exists', async () => {
    db.merchant.findFirst.mockResolvedValue({ id: 'm1' })
    const res = await post(signup, details)
    expect(res.status).toBe(409)
    expect(res.body.error).not.toMatch(/already exists/i)
    expect(db.merchant.create).not.toHaveBeenCalled()
  })

  it('limits how many sign-ups one network can try', async () => {
    limits.isRateLimited.mockResolvedValue(true)
    const res = await post(signup, details)
    expect(res.status).toBe(429)
    expect(db.merchant.findFirst).not.toHaveBeenCalled()
  })

  it('uses the shared password rule', async () => {
    const res = await post(signup, { ...details, password: 'short' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/at least 8/)
  })
})
