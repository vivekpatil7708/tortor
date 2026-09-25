import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { makeMerchant } from './helpers'
import { createCheckoutLink, getPaylinkView, createCheckoutFromLink, serializeCheckoutLink } from '@/lib/payment-link'

describe('payment links (CheckoutLink)', () => {
  let merchantId = ''

  beforeAll(async () => {
    const m = await makeMerchant()
    merchantId = m.id
  })

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE payments, checkout_links, webhook_events, email_logs, order_status_history, order_items, orders, customers RESTART IDENTITY CASCADE'
    )
  })

  it('creates a link with a unique slug and public url', async () => {
    const link = await createCheckoutLink({
      merchantId,
      title: 'Donate ₹500',
      description: 'Thanks for supporting us',
      mode: 'live',
      amount: 500,
    })
    expect(link.slug).toHaveLength(10)
    const view = await getPaylinkView(link.slug)
    expect(view).not.toBeNull()
    expect(view!.merchant.business_name).toBe('Test Store')
    expect(view!.link.amount).toBe(500)
    expect(view!.link.url).toContain(`/paylink/${link.slug}`)
  })

  it('a fixed-amount link starts a checkout with exactly that amount', async () => {
    const link = await createCheckoutLink({ merchantId, title: 'Membership', mode: 'test', amount: 999 })
    const result = await createCheckoutFromLink(link.slug, { customer: { name: 'Priya', email: 'priya@test.dev' } })

    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.checkout_session_id).toMatch(/^cs_/)
      const payment = await prisma.payment.findUnique({ where: { checkoutSessionId: result.checkout_session_id } })
      expect(Number(payment!.amount)).toBeCloseTo(999, 0)
      expect(payment!.checkoutLinkId).toBe(link.id)
    }
    const updated = await prisma.checkoutLink.findUnique({ where: { id: link.id } })
    expect(updated!.paymentCount).toBe(1)
  })

  it('flexible links respect min/max bounds and custom amounts', async () => {
    const link = await createCheckoutLink({
      merchantId,
      title: 'Tip jar',
      mode: 'live',
      amountFlexible: true,
      minAmount: 50,
      maxAmount: 5000,
    })

    const tooSmall = await createCheckoutFromLink(link.slug, { amount: 10 })
    expect('error' in tooSmall).toBe(true)

    const tooBig = await createCheckoutFromLink(link.slug, { amount: 5001 })
    expect('error' in tooBig).toBe(true)

    const ok = await createCheckoutFromLink(link.slug, { amount: 250 })
    expect('error' in ok).toBe(false)
    if (!('error' in ok)) {
      const payment = await prisma.payment.findUnique({ where: { checkoutSessionId: ok.checkout_session_id } })
      expect(Number(payment!.amount)).toBeCloseTo(250, 0)
    }
  })

  it('expired links are not visible and reject checkouts', async () => {
    const link = await createCheckoutLink({
      merchantId,
      title: 'Summer sale',
      mode: 'live',
      amount: 100,
      expiryAt: new Date(Date.now() - 1000),
    })
    expect(await getPaylinkView(link.slug)).toBeNull()
    const result = await createCheckoutFromLink(link.slug)
    expect('error' in result).toBe(true)
  })

  it('links hit max payments stop taking orders', async () => {
    const link = await createCheckoutLink({ merchantId, title: 'Limited', mode: 'test', amount: 100, maxPayments: 2 })
    await createCheckoutFromLink(link.slug)
    await createCheckoutFromLink(link.slug)
    const third = await createCheckoutFromLink(link.slug)
    expect('error' in third).toBe(true)
    expect((third as { error: string }).error).toContain('limit')
  })

  it('inactive links are not viewable', async () => {
    const link = await createCheckoutLink({ merchantId, title: 'Off', mode: 'live', amount: 10, active: false })
    expect(await getPaylinkView(link.slug)).toBeNull()
  })

  it('serialization is JSON-safe and snake_cased', async () => {
    const link = await createCheckoutLink({
      merchantId,
      title: 'S',
      mode: 'test',
      amount: 1200.5,
      customMessage: 'Hi there',
    })
    const serialized = serializeCheckoutLink(link)
    expect(serialized.amount).toBeCloseTo(1200.5, 1)
    expect(serialized.amount_flexible).toBe(false)
    expect(serialized.custom_message).toBe('Hi there')
    expect(() => JSON.parse(JSON.stringify(serialized))).not.toThrow()
  })
})