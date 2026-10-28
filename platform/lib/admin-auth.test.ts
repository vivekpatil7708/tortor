import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
}))
const jwtVerifyMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth', () => ({
  ADMIN_SECOND_FACTOR_COOKIE: 'toropay_admin_2fa',
  getSession: auth.getSession,
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => ({ value: 'admin-2fa-token' })),
  })),
}))
vi.mock('jose', async importOriginal => {
  const actual = await importOriginal<typeof import('jose')>()
  return { ...actual, jwtVerify: jwtVerifyMock }
})

import { isAdminEmail, requireAdmin } from '@/lib/admin-auth'

const adminSession = {
  id: 'merchant-id',
  email: 'merchant@example.com',
  emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
  accountId: 'admin-id',
  accountEmail: 'admin@example.com',
  accountEmailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.ADMIN_EMAIL = 'Admin@Example.com'
  process.env.JWT_SECRET = 'test-secret'
  auth.getSession.mockResolvedValue(adminSession)
  jwtVerifyMock.mockResolvedValue({ payload: { purpose: 'admin_2fa', sub: 'admin-id' } })
})

describe('isAdminEmail', () => {
  it('matches case-insensitively and ignores surrounding spaces', () => {
    expect(isAdminEmail('admin@example.com')).toBe(true)
    expect(isAdminEmail('  ADMIN@EXAMPLE.COM ')).toBe(true)
    expect(isAdminEmail('other@example.com')).toBe(false)
  })
})

describe('requireAdmin', () => {
  it('uses the logged-in account while an admin is viewing a merchant', async () => {
    await expect(requireAdmin()).resolves.toMatchObject({
      id: 'merchant-id',
      accountId: 'admin-id',
      accountEmail: 'admin@example.com',
    })
  })

  it('rejects a session whose account email is not the admin', async () => {
    auth.getSession.mockResolvedValue({
      ...adminSession,
      accountEmail: 'merchant@example.com',
    })
    await expect(requireAdmin()).rejects.toThrow('Forbidden')
  })

  it('rejects an unverified admin account', async () => {
    auth.getSession.mockResolvedValue({
      ...adminSession,
      accountEmailVerifiedAt: null,
    })
    await expect(requireAdmin()).rejects.toThrow('Forbidden')
  })

  it('checks the second-factor cookie against the account, not the viewed merchant', async () => {
    jwtVerifyMock.mockResolvedValue({ payload: { purpose: 'admin_2fa', sub: 'merchant-id' } })
    await expect(requireAdmin()).rejects.toThrow('Forbidden')
  })
})
