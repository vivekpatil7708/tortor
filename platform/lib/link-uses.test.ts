import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { CHECKOUT_HOLD_MINUTES, linkRoom, usesTakenWhere } from './link-uses'

const calls: string[] = []
const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  transaction: { count: vi.fn(), create: vi.fn() },
  paymentLink: { update: vi.fn() },
}))
const db = vi.hoisted(() => ({
  paymentLink: { findFirst: vi.fn() },
  transaction: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/link-amount', () => ({ checkLinkAmount: () => ({ ok: true, amount: 499 }) }))

import { POST as startCheckout } from '@/app/api/transactions/route'

const now = new Date('2026-10-06T12:00:00Z')

describe('what takes up a limited use (B6)', () => {
  it('counts paid payments, ones waiting for the merchant, and checkouts started in the last 30 minutes', () => {
    expect(CHECKOUT_HOLD_MINUTES).toBe(30)
    expect(usesTakenWhere('L1', now)).toEqual({
      paymentLinkId: 'L1',
      OR: [
        { status: { in: ['success', 'pending'] } },
        { status: 'initiated', createdAt: { gte: new Date('2026-10-06T11:30:00Z') } },
      ],
    })
  })

  it('so rejected payments and abandoned checkouts free their use', () => {
    const where = usesTakenWhere('L1', now) as { OR: Array<{ status: unknown }> }
    const statuses = JSON.stringify(where.OR.map(c => c.status))
    expect(statuses).not.toContain('failed')
  })

  const counts = (paid: number, taken: number) => ({
    transaction: {
      count: vi.fn(async ({ where }: { where: { status?: unknown } }) => (where.status === 'success' ? paid : taken)),
    },
  })

  it('is open, busy while the last uses are being paid, and used up once paid', async () => {
    const link = { id: 'L1', maxUses: 1 }
    expect(await linkRoom(counts(0, 0), link, now)).toBe('open')
    expect(await linkRoom(counts(0, 1), link, now)).toBe('busy')
    expect(await linkRoom(counts(1, 1), link, now)).toBe('used-up')
  })

  it("doesn't count anything for links without a limit", async () => {
    const db = counts(5, 5)
    expect(await linkRoom(db, { id: 'L1', maxUses: null }, now)).toBe('open')
    expect(db.transaction.count).not.toHaveBeenCalled()
  })
})

describe('starting a checkout on a limited link (B6)', () => {
  const link = (maxUses: number | null) => ({
    id: 'L1', merchantId: 'm1', status: 'active', expiryAt: null, maxUses, useCount: 7, merchant: { status: 'active' },
  })
  const start = () => startCheckout(new NextRequest('http://localhost/api/transactions', {
    method: 'POST',
    body: JSON.stringify({ payment_link_id: 'L1', txn_id: 'TXN1', amount: 499, customer_name: 'Asha', customer_phone: '+919999999999' }),
  }))

  beforeEach(() => {
    vi.clearAllMocks()
    calls.length = 0
    db.transaction.findUnique.mockResolvedValue(null)
    db.$transaction.mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx))
    tx.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) => { calls.push(sql.join('?').includes('FOR UPDATE') ? 'lock' : 'sql') })
    tx.transaction.count.mockImplementation(async () => { calls.push('count'); return 0 })
    tx.transaction.create.mockImplementation(async ({ data }: { data: { txnId: string } }) => { calls.push('create'); return { txnId: data.txnId, status: 'initiated' } })
    tx.paymentLink.update.mockImplementation(async () => { calls.push('count-started') })
  })

  it('checks the limit inside the lock, before saving the payment, so two customers cannot both take the last use', async () => {
    db.paymentLink.findFirst.mockResolvedValue(link(1))

    const res = await start()

    expect(res.status).toBe(200)
    expect(calls).toEqual(['lock', 'count', 'create', 'count-started'])
    expect(tx.$queryRaw.mock.calls[0].slice(1)).toEqual(['L1'])
  })

  it('refuses a new checkout when every use is taken', async () => {
    db.paymentLink.findFirst.mockResolvedValue(link(1))
    tx.transaction.count.mockResolvedValue(1)

    const res = await start()

    expect(res.status).toBe(410)
    expect(tx.transaction.create).not.toHaveBeenCalled()
  })

  it('ignores the old started-checkouts counter, so abandoned attempts no longer close the link', async () => {
    db.paymentLink.findFirst.mockResolvedValue(link(1)) // useCount is 7, but nothing is paid or in progress
    expect((await start()).status).toBe(200)
  })

  it("doesn't lock or count for links without a limit", async () => {
    db.paymentLink.findFirst.mockResolvedValue(link(null))

    expect((await start()).status).toBe(200)
    expect(calls).toEqual(['create', 'count-started'])
  })
})
