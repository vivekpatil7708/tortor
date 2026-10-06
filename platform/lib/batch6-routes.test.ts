import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-pepper'

const db = vi.hoisted(() => ({
  apiKey: { findMany: vi.fn(), update: vi.fn() },
  merchant: { findUnique: vi.fn(), update: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => ({ id: 'm1' })),
  getSession: vi.fn(),
  merchantToJson: (m: unknown) => m,
}))

import { authenticateApiKey, generateApiKey } from '@/lib/api-key'
import { GET as qr } from '@/app/api/qr/route'
import { PATCH as updateMerchant } from '@/app/api/merchant/route'

beforeEach(() => {
  vi.clearAllMocks()
  db.apiKey.update.mockResolvedValue({})
})

const keyRow = (overrides: Record<string, unknown>) => ({
  id: 'k', merchantId: 'm1', mode: 'live', scopes: '["orders:write"]', revokedAt: null, expiresAt: null, ...overrides,
})

describe('API key lookup (#36)', () => {
  it('finds a current key by its full prefix', async () => {
    const { rawKey, keyPrefix, keyHash } = generateApiKey('live')
    db.apiKey.findMany.mockResolvedValueOnce([keyRow({ id: 'new', keyPrefix, keyHash })])

    const auth = await authenticateApiKey(`Bearer ${rawKey}`)

    expect(auth?.apiKeyId).toBe('new')
    expect(db.apiKey.findMany).toHaveBeenCalledTimes(1)
  })

  it('checks every old-style key that shares a short prefix, not just the first', async () => {
    const shared = 'tp_live_abcd'
    const mine = `${shared}1111111111`
    const other = `${shared}2222222222`
    db.apiKey.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        keyRow({ id: 'other', keyPrefix: shared, keyHash: bcrypt.hashSync(other, 4) }),
        keyRow({ id: 'mine', keyPrefix: shared, keyHash: bcrypt.hashSync(mine, 4) }),
      ])

    const auth = await authenticateApiKey(`Bearer ${mine}`)

    expect(auth?.apiKeyId).toBe('mine')
  })

  it('refuses a revoked key', async () => {
    const { rawKey, keyPrefix, keyHash } = generateApiKey('live')
    db.apiKey.findMany.mockResolvedValueOnce([keyRow({ keyPrefix, keyHash, revokedAt: new Date() })])
    expect(await authenticateApiKey(`Bearer ${rawKey}`)).toBeNull()
  })
})

describe('QR generator (#37)', () => {
  const get = (query: string) => qr(new NextRequest(`http://localhost/api/qr?${query}`))

  it('draws a QR for a valid UPI ID and lets Vercel cache it', async () => {
    const res = await get('vpa=shop@okaxis&amount=19.99&txn_id=TXN1759740000000ABC123&note=Order%20%2342')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toContain('s-maxage=86400')
  })

  it('accepts amounts with long decimal tails, as pages compute them', async () => {
    expect((await get('vpa=shop@okaxis&amount=1499.9999999999998&txn_id=PREVIEW')).status).toBe(200)
  })

  it('refuses bad UPI IDs, amounts and transaction IDs', async () => {
    expect((await get('vpa=not-a-upi-id&amount=10&txn_id=T1')).status).toBe(400)
    expect((await get('vpa=shop@okaxis&amount=0&txn_id=T1')).status).toBe(400)
    expect((await get('vpa=shop@okaxis&amount=50000000&txn_id=T1')).status).toBe(400)
    expect((await get('vpa=shop@okaxis&amount=10&txn_id=bad%20id%3Cscript%3E')).status).toBe(400)
  })
})

describe('branding images on save (#30)', () => {
  const save = (body: Record<string, unknown>) =>
    updateMerchant(new NextRequest('http://localhost/api/merchant', { method: 'PATCH', body: JSON.stringify(body) }))

  it("doesn't re-check an image that hasn't changed, so an older large logo never blocks a save", async () => {
    const oldLogo = 'data:image/svg+xml;base64,AAAA'
    db.merchant.findUnique.mockResolvedValue({ businessLogoUrl: oldLogo, bgImageUrl: null })
    db.merchant.update.mockResolvedValue({ id: 'm1' })

    const res = await save({ business_logo_url: oldLogo, brand_color_primary: '#123456' })

    expect(res.status).toBe(200)
  })

  it('refuses a new image that breaks the rules', async () => {
    db.merchant.findUnique.mockResolvedValue({ businessLogoUrl: null, bgImageUrl: null })

    const res = await save({ bg_image_url: 'data:image/svg+xml;base64,AAAA' })

    expect(res.status).toBe(400)
    expect(db.merchant.update).not.toHaveBeenCalled()
  })
})
