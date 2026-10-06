import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Creating a payment link (POST /api/links): the UPI ID must be one of the
// merchant's saved UPI IDs. Login and database are replaced by fakes.
const db = vi.hoisted(() => ({
  upiId: { findFirst: vi.fn() },
  paymentLink: { create: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ id: 'm1', emailVerifiedAt: new Date() })) }))
vi.mock('@/lib/serializers', () => ({ serializeLink: (link: unknown) => link }))

import { POST } from '@/app/api/links/route'

const create = (body: Record<string, unknown>) =>
  POST(new NextRequest('http://localhost/api/links', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => {
  vi.clearAllMocks()
  db.paymentLink.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data)
})

describe('POST /api/links', () => {
  it("refuses a UPI ID the merchant hasn't saved", async () => {
    db.upiId.findFirst.mockResolvedValue(null)

    const res = await create({ title: 'Order', upi_id: 'typo@okaxis', amount: 499 })

    expect(res.status).toBe(400)
    expect(db.paymentLink.create).not.toHaveBeenCalled()
  })

  it('accepts a saved UPI ID (any letter case) and stores it as saved', async () => {
    db.upiId.findFirst.mockResolvedValue({ id: 'u1', vpa: 'shop@okaxis' })

    const res = await create({ title: 'Order', upi_id: ' Shop@OKAXIS ', amount: 499 })

    expect(res.status).toBe(200)
    expect(db.upiId.findFirst).toHaveBeenCalledWith({
      where: { merchantId: 'm1', vpa: { equals: 'Shop@OKAXIS', mode: 'insensitive' } },
    })
    expect(db.paymentLink.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ upiId: 'shop@okaxis' }),
    }))
  })
})
