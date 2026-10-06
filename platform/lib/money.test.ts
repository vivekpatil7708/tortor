import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { MAX_LINK_AMOUNT, linkAmountInput, roundToPaise } from './money'
import { checkLinkAmount } from './link-amount'

const db = vi.hoisted(() => ({
  upiId: { findFirst: vi.fn() },
  paymentLink: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  transaction: { groupBy: vi.fn(), count: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ id: 'm1', emailVerifiedAt: new Date() })) }))

import { POST as createLink } from '@/app/api/links/route'
import { PATCH as updateLink } from '@/app/api/links/[id]/route'
import { GET as summary } from '@/app/api/analytics/summary/route'

describe('whole paise (B14)', () => {
  it('rounds rupees to paise', () => {
    expect(roundToPaise(499.999)).toBe(500)
    expect(roundToPaise(19.99 * 3)).toBe(59.97)
    expect(roundToPaise(0.1 + 0.2)).toBe(0.3)
  })

  it('reads a link amount: none, a rounded amount, or a refusal', () => {
    for (const none of [null, undefined, '', 0, '0']) expect(linkAmountInput(none)).toEqual({ ok: true, value: null })
    expect(linkAmountInput('499.999')).toEqual({ ok: true, value: 500 })
    expect(linkAmountInput(59.970000000000006)).toEqual({ ok: true, value: 59.97 })
    expect(linkAmountInput(MAX_LINK_AMOUNT)).toEqual({ ok: true, value: 10_00_000 })
    for (const bad of [-5, 0.004, MAX_LINK_AMOUNT + 1, 'abc', NaN, {}]) {
      expect(linkAmountInput(bad).ok).toBe(false)
    }
    expect(linkAmountInput(-1, 'Minimum amount')).toEqual({ ok: false, error: 'Minimum amount must be between ₹0.01 and ₹10,00,000' })
  })

  it('charges a fixed-price link saved before rounding in whole paise', () => {
    const legacy = { amount: 499.999, amountFlexible: false, minAmount: null, maxAmount: null, customFields: '[]' }
    expect(checkLinkAmount(legacy, 500, null)).toEqual({ ok: true, amount: 500, products: null })
  })
})

describe('saving link amounts (B14)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.upiId.findFirst.mockResolvedValue({ id: 'u1', vpa: 'shop@okaxis' })
    db.paymentLink.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...data, id: 'L1', createdAt: new Date(), updatedAt: new Date() }))
  })

  const create = (body: Record<string, unknown>) =>
    createLink(new NextRequest('http://localhost/api/links', { method: 'POST', body: JSON.stringify({ title: 'Order', upi_id: 'shop@okaxis', ...body }) }))

  it('saves a new link amount in whole paise', async () => {
    expect((await create({ amount: 499.999 })).status).toBe(200)
    expect(db.paymentLink.create.mock.calls[0][0].data.amount).toBe(500)
  })

  it('keeps product links and flexible links working with no fixed amount', async () => {
    expect((await create({ amount: 0, amount_flexible: true, min_amount: '', max_amount: null })).status).toBe(200)
    expect(db.paymentLink.create.mock.calls[0][0].data).toMatchObject({ amount: null, minAmount: null, maxAmount: null })
  })

  it('refuses amounts no UPI app can charge, and a minimum above the maximum', async () => {
    for (const body of [{ amount: -10 }, { amount: 50_00_000 }, { amount: 0.001 }, { min_amount: 500, max_amount: 100, amount_flexible: true }]) {
      expect((await create(body)).status, JSON.stringify(body)).toBe(400)
    }
    expect(db.paymentLink.create).not.toHaveBeenCalled()
  })

  it('rounds or refuses a changed amount the same way', async () => {
    const existing = { id: 'L1', merchantId: 'm1', title: 'Order', description: null, status: 'active', amount: 100, buttonText: null, webhookUrl: null, redirectUrl: null }
    db.paymentLink.findFirst.mockResolvedValue(existing)
    db.paymentLink.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...existing, ...data, createdAt: new Date(), updatedAt: new Date() }))
    const update = (body: Record<string, unknown>) =>
      updateLink(new NextRequest('http://localhost/api/links/L1', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'L1' }) })

    expect((await update({ amount: '249.995' })).status).toBe(200)
    expect(db.paymentLink.update.mock.calls[0][0].data.amount).toBe(250)

    expect((await update({ amount: -1 })).status).toBe(400)
    expect(db.paymentLink.update).toHaveBeenCalledTimes(1)
  })
})

describe('totals (B14)', () => {
  it('adds up to whole paise', async () => {
    db.transaction.groupBy.mockResolvedValue([{ status: 'success', _count: { _all: 2 }, _sum: { amount: 0.1 + 0.2 } }])
    db.transaction.count.mockResolvedValue(0)

    const body = await (await summary(new NextRequest('http://localhost/api/analytics/summary'))).json()

    expect(body.gross_payment_volume).toBe(0.3)
  })
})
