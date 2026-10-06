import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const db = vi.hoisted(() => ({
  paymentLink: { findFirst: vi.fn() },
  transaction: { findFirst: vi.fn(), findUnique: vi.fn() },
  merchant: { findUnique: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT ${url}`) }),
  useRouter: vi.fn(),
}))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => createElement('a', { href }, children),
}))

import CheckoutPage from '@/app/pay/[slug]/page'
import StatusPage from '@/app/pay/[slug]/success/page'

const link = (overrides: Record<string, unknown> = {}) => ({
  id: 'link-1', slug: 'abc123', status: 'active', merchantId: 'm1', upiId: 'shop@okaxis', title: 'Order',
  description: null, amount: 499, amountFlexible: false, minAmount: null, maxAmount: null, customFields: '[]',
  buttonText: null, redirectUrl: null, expiryAt: null, maxUses: null, useCount: 0, ...overrides,
})
const merchant = (status = 'active') => ({
  status, businessLogoUrl: null, bgImageUrl: null, brandColorPrimary: '#000000', brandColorSecondary: '#111111',
  buttonStyle: 'rounded', pageTheme: 'light',
})
const started = (status: string) => ({ txnId: 'TXN1', amount: 499, status })

type CheckoutElement = ReactElement<{ resume: unknown }>
const open = (query: { txn?: string } = {}) =>
  CheckoutPage({ params: Promise.resolve({ slug: 'abc123' }), searchParams: Promise.resolve(query) }) as Promise<CheckoutElement>

beforeEach(() => {
  vi.clearAllMocks()
  db.paymentLink.findFirst.mockResolvedValue(link())
  db.merchant.findUnique.mockResolvedValue(merchant())
  db.transaction.findFirst.mockResolvedValue(null)
})

describe('reopening a payment after a refresh or the UPI app (B3)', () => {
  it('shows the form when the address has no payment', async () => {
    const page = await open()
    expect(page.props.resume).toBeNull()
    expect(db.transaction.findFirst).not.toHaveBeenCalled()
  })

  it('reopens the same payment, with the amount from the database', async () => {
    db.transaction.findFirst.mockResolvedValue(started('initiated'))

    const page = await open({ txn: 'TXN1' })

    expect(page.props.resume).toEqual({ txn_id: 'TXN1', amount: 499, status: 'initiated' })
    expect(db.transaction.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { txnId: 'TXN1', paymentLinkId: 'link-1' },
    }))
  })

  it('keeps showing "waiting" for a payment the customer already marked as paid', async () => {
    db.transaction.findFirst.mockResolvedValue(started('pending'))
    expect((await open({ txn: 'TXN1' })).props.resume).toEqual({ txn_id: 'TXN1', amount: 499, status: 'pending' })
  })

  it('reopens its own payment on a used-up single-use link, but stays closed to new visitors', async () => {
    db.paymentLink.findFirst.mockResolvedValue(link({ maxUses: 1, useCount: 1 }))
    db.transaction.findFirst.mockResolvedValue(started('initiated'))
    expect((await open({ txn: 'TXN1' })).props.resume).toMatchObject({ txn_id: 'TXN1' })

    await expect(open()).rejects.toThrow('NEXT_NOT_FOUND')

    db.transaction.findFirst.mockResolvedValue(null) // a payment from another link
    await expect(open({ txn: 'OTHER' })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('ignores a malformed payment ID', async () => {
    const page = await open({ txn: '<script>alert(1)</script>' })
    expect(page.props.resume).toBeNull()
    expect(db.transaction.findFirst).not.toHaveBeenCalled()
  })

  it("still hides a suspended merchant's link", async () => {
    db.merchant.findUnique.mockResolvedValue(merchant('suspended'))
    db.transaction.findFirst.mockResolvedValue(started('initiated'))
    await expect(open({ txn: 'TXN1' })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('a payment that is already settled (B2, B3)', () => {
  it('sends a rejected payment to the status page', async () => {
    db.transaction.findFirst.mockResolvedValue(started('failed'))
    await expect(open({ txn: 'TXN1' })).rejects.toThrow('NEXT_REDIRECT /pay/abc123/success?txn=TXN1')
  })

  it("sends a confirmed payment to the merchant's page when the link has one", async () => {
    db.transaction.findFirst.mockResolvedValue(started('success'))
    await expect(open({ txn: 'TXN1' })).rejects.toThrow('NEXT_REDIRECT /pay/abc123/success?txn=TXN1')

    db.paymentLink.findFirst.mockResolvedValue(link({ redirectUrl: 'https://shop.example/thanks' }))
    await expect(open({ txn: 'TXN1' })).rejects.toThrow('NEXT_REDIRECT https://shop.example/thanks')
  })
})

describe('status page (B2)', () => {
  const show = async (status: string) => {
    db.transaction.findUnique.mockResolvedValue({ ...started(status), paymentLink: { slug: 'abc123' } })
    const page = await StatusPage({ params: Promise.resolve({ slug: 'abc123' }), searchParams: Promise.resolve({ txn: 'TXN1' }) })
    return renderToStaticMarkup(page)
  }

  it('tells the customer a rejected payment was not confirmed, and offers Try again', async () => {
    const html = await show('failed')
    expect(html).toContain('Payment not confirmed')
    expect(html).toContain('href="/pay/abc123"')
    expect(html).toContain('Try again')
  })

  it("doesn't offer Try again while waiting or after a confirmed payment", async () => {
    expect(await show('pending')).not.toContain('Try again')
    expect(await show('success')).not.toContain('Try again')
  })
})
