import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const db = vi.hoisted(() => ({
  paymentLink: { findFirst: vi.fn() },
  transaction: { findFirst: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
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
import LinkClosed from '@/app/pay/[slug]/link-closed'
import StatusPage from '@/app/pay/[slug]/success/page'

const link = (overrides: Record<string, unknown> = {}) => ({
  id: 'link-1', slug: 'abc123', status: 'active', merchantId: 'm1', upiId: 'shop@okaxis', title: 'Order',
  description: null, amount: 499, amountFlexible: false, minAmount: null, maxAmount: null, customFields: '[]',
  buttonText: null, redirectUrl: null, expiryAt: null, maxUses: null, useCount: 0, ...overrides,
})
const merchant = (status = 'active') => ({
  status, businessLogoUrl: null, bgImageUrl: null, brandColorPrimary: '#000000', brandColorSecondary: '#111111',
  buttonStyle: 'rounded', pageTheme: 'light',
  businessName: 'Asha Crafts', supportEmail: 'help@ashacrafts.in', supportPhone: '+91 98765 43210',
})
const started = (status: string) => ({ txnId: 'TXN1', amount: 499, status })
/** Paid payments, and every payment that holds a use (paid, waiting, or started in the last 30 minutes). */
const uses = (paid: number, taken: number) =>
  db.transaction.count.mockImplementation(async ({ where }: { where: { status?: unknown } }) => (where.status === 'success' ? paid : taken))

type CheckoutElement = ReactElement<{ resume: unknown; reason: unknown; business: unknown; data: { merchant: Record<string, unknown> } }>
const open = (query: { txn?: string } = {}) =>
  CheckoutPage({ params: Promise.resolve({ slug: 'abc123' }), searchParams: Promise.resolve(query) }) as Promise<CheckoutElement>

beforeEach(() => {
  vi.clearAllMocks()
  db.paymentLink.findFirst.mockResolvedValue(link())
  db.merchant.findUnique.mockResolvedValue(merchant())
  db.transaction.findFirst.mockResolvedValue(null)
  uses(0, 0)
})

describe('reopening a payment after a refresh or the UPI app (B3)', () => {
  it('shows the form when the address has no payment', async () => {
    const page = await open()
    expect(page.props.resume).toBeNull()
    expect(db.transaction.findFirst).not.toHaveBeenCalled()
  })

  it('tells the form who the customer is paying (U1)', async () => {
    expect((await open()).props.data.merchant.business_name).toBe('Asha Crafts')
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

  it('reopens its own payment on a full single-use link, but stays closed to new visitors', async () => {
    db.paymentLink.findFirst.mockResolvedValue(link({ maxUses: 1, useCount: 1 }))
    uses(0, 1) // this customer's own checkout holds the only use
    db.transaction.findFirst.mockResolvedValue(started('initiated'))
    expect((await open({ txn: 'TXN1' })).props.resume).toMatchObject({ txn_id: 'TXN1' })

    const newVisitor = await open()
    expect(newVisitor.type).toBe(LinkClosed)
    expect(newVisitor.props.reason).toBe('busy')

    db.transaction.findFirst.mockResolvedValue(null) // a payment from another link
    expect((await open({ txn: 'OTHER' })).props.reason).toBe('busy')
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

describe('a link that cannot take payments (B10)', () => {
  it('says an expired link has expired, with the business and its support contacts', async () => {
    db.paymentLink.findFirst.mockResolvedValue(link({ expiryAt: new Date('2026-01-01T00:00:00Z') }))

    const page = await open()

    expect(page.props.reason).toBe('expired')
    const html = renderToStaticMarkup(page)
    expect(html).toContain('This payment link has expired')
    expect(html).toContain('Asha Crafts')
    expect(html).toContain('mailto:help@ashacrafts.in')
    expect(html).toContain('tel:+919876543210')
  })

  it("says a used-up or switched-off link isn't accepting payments", async () => {
    db.paymentLink.findFirst.mockResolvedValue(link({ maxUses: 2 }))
    uses(2, 2)
    expect((await open()).props.reason).toBe('used-up')

    db.paymentLink.findFirst.mockResolvedValue(link({ status: 'inactive' }))
    const page = await open()
    expect(page.props.reason).toBe('inactive')
    expect(renderToStaticMarkup(page)).toContain('isn&#x27;t accepting payments')
  })

  it('opens normally while uses are left', async () => {
    db.paymentLink.findFirst.mockResolvedValue(link({ maxUses: 2 }))
    uses(1, 1)
    expect((await open()).props.resume).toBeNull()
  })

  it('loads only public contact details, never the login email or phone', async () => {
    db.paymentLink.findFirst.mockResolvedValue(link({ status: 'inactive' }))
    await open()

    const select = db.merchant.findUnique.mock.calls[0][0].select
    expect(select).toMatchObject({ businessName: true, supportEmail: true, supportPhone: true })
    expect(select).not.toHaveProperty('email')
    expect(select).not.toHaveProperty('phone')
  })

  it('still shows "not found" for a deleted link or a suspended account', async () => {
    db.paymentLink.findFirst.mockResolvedValue(null)
    await expect(open()).rejects.toThrow('NEXT_NOT_FOUND')

    db.paymentLink.findFirst.mockResolvedValue(link({ status: 'inactive' }))
    db.merchant.findUnique.mockResolvedValue(merchant('suspended'))
    await expect(open()).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('status page (B2, U11)', () => {
  const stored = (status: string, overrides: Record<string, unknown> = {}) => ({
    ...started(status),
    createdAt: new Date('2026-10-07T10:15:00Z'),
    confirmedAt: status === 'success' ? new Date('2026-10-07T10:20:00Z') : null,
    paymentLink: { slug: 'abc123', title: 'Order #12' },
    merchant: { businessName: 'Asha Crafts', businessLogoUrl: null, supportEmail: 'help@ashacrafts.in', supportPhone: '+91 98765 43210' },
    ...overrides,
  })
  const show = async (status: string, overrides: Record<string, unknown> = {}) => {
    db.transaction.findUnique.mockResolvedValue(stored(status, overrides))
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

  it('shows a receipt: who was paid, for what, when (India time) and the reference', async () => {
    const html = await show('success')
    expect(html).toContain('Payment confirmed')
    expect(html).toContain('Asha Crafts has confirmed your payment')
    expect(html).toContain('Order #12')
    expect(html).toMatch(/7 Oct 2026, 3:45\spm IST/)
    expect(html).toMatch(/7 Oct 2026, 3:50\spm IST/) // confirmed
    expect(html).toContain('TXN1')
    expect(html).toContain('Copy')
    expect(html).toContain('mailto:help@ashacrafts.in')
    expect(html).toContain('tel:+919876543210')
    // The customer never goes to ToroPay's own home page from here.
    expect(html).not.toContain('Back to home')
    expect(html).not.toContain('href="/"')
  })

  it('shows no confirmation time until the seller confirms', async () => {
    const html = await show('pending')
    expect(html).toContain('Waiting for confirmation')
    expect(html).toMatch(/3:45\spm IST/)
    expect(html).not.toContain('Confirmed')
  })

  it('works for a business without a name or support contacts', async () => {
    const html = await show('pending', { merchant: { businessName: '', businessLogoUrl: null, supportEmail: null, supportPhone: null } })
    expect(html).toContain('The seller will confirm your payment')
    expect(html).not.toContain('Paid to')
    expect(html).not.toContain('Questions about this payment')
  })

  it('loads only public business details, never the login email or phone', async () => {
    await show('success')
    const select = db.transaction.findUnique.mock.calls[0][0].select
    expect(select.merchant.select).toEqual({ businessName: true, businessLogoUrl: true, supportEmail: true, supportPhone: true })
  })

  it("shows nothing about a payment from another link, or one that doesn't exist", async () => {
    const other = await show('success', { paymentLink: { slug: 'other1', title: 'Other' } })
    expect(other).toContain('Payment not found')
    expect(other).not.toContain('TXN1')
    expect(other).not.toContain('Asha Crafts')

    db.transaction.findUnique.mockResolvedValue(null)
    const missing = renderToStaticMarkup(await StatusPage({ params: Promise.resolve({ slug: 'abc123' }), searchParams: Promise.resolve({ txn: 'NOPE' }) }))
    expect(missing).toContain('Payment not found')
    expect(missing).not.toContain('Try again')
  })
})
