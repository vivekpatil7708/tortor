import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Password reset looks the emailed token up by its fingerprint.
const db = vi.hoisted(() => ({ merchant: { findFirst: vi.fn(), update: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/auth', () => ({ hashPassword: vi.fn(async () => 'new-hash') }))

import { POST } from '@/app/api/auth/reset-password/route'
import { hashResetToken } from '@/lib/reset-token'

const reset = (body: Record<string, unknown>) =>
  POST(new NextRequest('http://localhost/api/auth/reset-password', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => vi.clearAllMocks())

describe('POST /api/auth/reset-password', () => {
  it('finds the account by the token fingerprint, never the raw token', async () => {
    db.merchant.findFirst.mockResolvedValue({ id: 'm1' })

    const res = await reset({ token: 'emailed-token', password: 'Toropay2026' })

    expect(res.status).toBe(200)
    const { where } = db.merchant.findFirst.mock.calls[0][0]
    expect(where.resetToken).toBe(hashResetToken('emailed-token'))
    expect(where.resetToken).not.toBe('emailed-token')
  })

  it('refuses an unknown or expired token', async () => {
    db.merchant.findFirst.mockResolvedValue(null)
    const res = await reset({ token: 'nope', password: 'Toropay2026' })
    expect(res.status).toBe(400)
    expect(db.merchant.update).not.toHaveBeenCalled()
  })

  it('applies the shared password rule', async () => {
    const res = await reset({ token: 'emailed-token', password: 'alllowercase1' })
    expect(res.status).toBe(400)
    expect(db.merchant.findFirst).not.toHaveBeenCalled()
  })
})
