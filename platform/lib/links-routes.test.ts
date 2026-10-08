import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import QRCode from 'qrcode'

// The payment links list (U21) and the QR code that opens a payment page (U22).
const db = vi.hoisted(() => ({
  paymentLink: { findMany: vi.fn() },
  transaction: { groupBy: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
const auth = vi.hoisted(() => ({ requireSession: vi.fn() }))
vi.mock('@/lib/auth', () => auth)

import { GET as listLinks } from '@/app/api/links/route'
import { GET as linkQr } from '@/app/api/qr/link/route'

const linkRow = (id: string) => ({
  id, merchantId: 'm1', upiId: 'shop@okaxis', title: `Link ${id}`, description: null, amount: 500, amountFlexible: false,
  minAmount: null, maxAmount: null, customFields: '[]', expiryAt: null, maxUses: null, useCount: 0, buttonText: null,
  redirectUrl: null, webhookUrl: null, slug: `slug-${id}`, status: 'active',
  createdAt: new Date('2026-10-01T00:00:00Z'), updatedAt: new Date('2026-10-01T00:00:00Z'),
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.requireSession.mockResolvedValue({ id: 'm1' })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('payment links list', () => {
  it("adds each link's paid payments and money received, counted in the database for your own links only", async () => {
    db.paymentLink.findMany.mockResolvedValue([linkRow('L1'), linkRow('L2')])
    db.transaction.groupBy.mockResolvedValue([{ paymentLinkId: 'L1', _count: { _all: 3 }, _sum: { amount: 1499.999 } }])

    const body = await (await listLinks()).json()

    expect(body.map((l: Record<string, unknown>) => [l.id, l.paid_count, l.paid_total])).toEqual([['L1', 3, 1500], ['L2', 0, 0]])
    expect(db.paymentLink.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { merchantId: 'm1' } }))
    expect(db.transaction.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['paymentLinkId'],
      where: { merchantId: 'm1', status: 'success', paymentLinkId: { not: null } },
    }))
  })

  it('reports a database failure as an error, not as "signed out"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.paymentLink.findMany.mockRejectedValue(Object.assign(new Error('connection lost'), { code: 'P1001' }))
    expect((await listLinks()).status).toBe(500)

    auth.requireSession.mockRejectedValue(new Error('Unauthorized'))
    expect((await listLinks()).status).toBe(401)
  })
})

describe('QR code for a payment link', () => {
  const get = (slug: string) => linkQr(new NextRequest(`http://localhost/api/qr/link?slug=${encodeURIComponent(slug)}`))

  it("opens the link's payment page on ToroPay's own site", async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.toropay.co.in/')
    const toBuffer = vi.spyOn(QRCode, 'toBuffer')

    const res = await get('u3MfoJlCOF')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(toBuffer.mock.calls[0][0]).toBe('https://www.toropay.co.in/pay/u3MfoJlCOF')
  })

  it('refuses anything that is not a link address, so it only ever points at a payment page', async () => {
    const toBuffer = vi.spyOn(QRCode, 'toBuffer')
    for (const slug of ['', 'https://evil.example', '../admin', 'a b', 'x'.repeat(101)]) {
      expect((await get(slug)).status, slug).toBe(400)
    }
    expect(toBuffer).not.toHaveBeenCalled()
  })
})
