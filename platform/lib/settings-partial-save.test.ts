import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
// Saving settings (PUT /api/settings) changes only the fields that were sent:
// Settings → Notifications sends just the alerts, and Developers sends just the
// webhook secret, so neither save can reset the other (e.g. turn alerts off).
const db = vi.hoisted(() => ({
  merchantSettings: { findUnique: vi.fn(), upsert: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ id: 'm1' })) }))
vi.mock('@/lib/serializers', () => ({
  maskSecret: (secret: string) => `${'*'.repeat(Math.max(0, secret.length - 4))}${secret.slice(-4)}`,
  serializeSettings: (s: unknown) => s,
}))
import { PUT } from '@/app/api/settings/route'

const masked = (secret: string) => `${'*'.repeat(Math.max(0, secret.length - 4))}${secret.slice(-4)}`

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PUT /api/settings', () => {
  it("saving only the notifications leaves the stored webhook secret alone", async () => {
    const existing = { merchantId: 'm1', webhookSecret: 's3cret-1234' }
    db.merchantSettings.findUnique.mockResolvedValue(existing)
    db.merchantSettings.upsert.mockResolvedValue(existing)
    const res = await PUT(new NextRequest('http://localhost/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ email_enabled: true, notification_email: 'owner@example.in' }),
    }))
    expect(res.status).toBe(200)
    expect(db.merchantSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: {
        emailEnabled: true,
        notificationEmail: 'owner@example.in',
      },
    }))
    const update = db.merchantSettings.upsert.mock.calls[0][0].update as Record<string, unknown>
    expect(update).not.toHaveProperty('webhookSecret')
    expect(update).not.toHaveProperty('smsEnabled')
    expect(update).not.toHaveProperty('autoSettlement')
  })

  it("a webhook secret sent back unchanged (the masked value it was shown) keeps the stored secret", async () => {
    const existing = { merchantId: 'm1', webhookSecret: 's3cret-1234' }
    db.merchantSettings.findUnique.mockResolvedValue(existing)
    db.merchantSettings.upsert.mockResolvedValue(existing)
    const res = await PUT(new NextRequest('http://localhost/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ webhook_secret: masked('s3cret-1234') }),
    }))
    expect(res.status).toBe(200)
    expect(db.merchantSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { webhookSecret: 's3cret-1234' },
    }))
  })

  it('a new webhook secret is stored', async () => {
    const existing = { merchantId: 'm1', webhookSecret: 's3cret-1234' }
    db.merchantSettings.findUnique.mockResolvedValue(existing)
    db.merchantSettings.upsert.mockResolvedValue(existing)
    const res = await PUT(new NextRequest('http://localhost/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ webhook_secret: 'brand-new-secret' }),
    }))
    expect(res.status).toBe(200)
    expect(db.merchantSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { webhookSecret: 'brand-new-secret' },
    }))
  })

  it("refuses an invalid alert email before the database is touched", async () => {
    const res = await PUT(new NextRequest('http://localhost/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ email_enabled: true, notification_email: 'not-an-email' }),
    }))
    expect(res.status).toBe(400)
    expect(db.merchantSettings.upsert).not.toHaveBeenCalled()
  })
})