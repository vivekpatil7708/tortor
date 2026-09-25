import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { makeMerchant, makeProduct } from './helpers'
import {
  createCheckoutLink,
  getPaylinkView,
  createCheckoutFromLink,
  serializeCheckoutLink,
  updateCheckoutLink,
} from '@/lib/payment-link'

describe('payment links with a multi-item order summary', () => {
  let merchantId = ''

  beforeAll(async () => {
    merchantId = (await makeMerchant()).id
  })

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE payments, checkout_links, webhook_events, email_logs, order_status_history, order_items, orders, products, customers RESTART IDENTITY CASCADE'
    )
  })

  it('stores items and exposes a live summary on the public view', async () => {
    const link = await createCheckoutLink({
      merchantId,
      title: 'Starter kit',
      mode: 'live',
      items: [
        { name: 'Tee', sku: 'TEE01', quantity: 2, unitPrice: 499 },
        { name: 'Cap', quantity: 1, unitPrice: 299 },
      ],
    })

    const view = await getPaylinkView(link.slug)
    expect(view!.link.items).toHaveLength(2)
    expect(view!.link.items[0]).toMatchObject({ name: 'Tee', sku: 'TEE01', quantity: 2, unit_price: 499 })
    expect(view!.link.items_total).toBe(1297) // 2*499 + 299

    const serialized = serializeCheckoutLink(link)
    expect(serialized.items_total).toBe(1297)
  })

  it('creates a checkout with exactly the item totals from the summary', async () => {
    const link = await createCheckoutLink({
      merchantId,
      title: 'Bundle',
      mode: 'live',
      items: [
        { name: 'A', quantity: 2, unitPrice: 100 },
        { name: 'B', quantity: 1, unitPrice: 50 },
      ],
    })
    const result = await createCheckoutFromLink(link.slug, { customer: { name: 'Dev', email: 'dev@test.dev' } })
    expect('error' in result).toBe(false)
    if ('error' in result) return

    expect(result.amount).toBe(250)
    expect(result.verified_amount).toBe(250)
    expect(result.subtotal_amount).toBe(250)

    const order = await prisma.order.findUnique({
      where: { id: result.toropay_order_id },
      include: { orderItems: true },
    })
    expect(order!.orderItems).toHaveLength(2)
  })

  it('re-prices linked items from the catalogue by sku before charging', async () => {
    const product = await makeProduct(merchantId, { name: 'Catalog Shirt', sku: 'SHIRT-X', price: 640 })
    const link = await createCheckoutLink({
      merchantId,
      title: 'Shirt link',
      mode: 'live',
      items: [{ productId: product.id, name: 'Shirt', sku: 'SHIRT-X', quantity: 1, unitPrice: 300 }],
    })

    const result = await createCheckoutFromLink(link.slug)
    expect('error' in result).toBe(false)
    if ('error' in result) return

    // Catalogue price (640) wins over the stale display price of 300.
    expect(result.amount).toBe(640)
    expect(result.verified_amount).toBe(640)

    const payment = await prisma.payment.findUnique({ where: { checkoutSessionId: result.checkout_session_id } })
    expect(payment!.amount.toNumber()).toBe(640)
  })

  it('updating a link can replace its items', async () => {
    const link = await createCheckoutLink({
      merchantId,
      title: 'V1',
      mode: 'live',
      items: [{ name: 'One', quantity: 1, unitPrice: 10 }],
    })
    await updateCheckoutLink(link.id, merchantId, {
      items: [{ name: 'Two', quantity: 2, unitPrice: 20 }],
    })
    const updated = await prisma.checkoutLink.findUnique({ where: { id: link.id } })
    const serialized = serializeCheckoutLink(updated!)
    expect(serialized.items).toHaveLength(1)
    expect(serialized.items[0].name).toBe('Two')
    expect(serialized.items_total).toBe(40)
  })

  it('keeps legacy single-amount links working with verification', async () => {
    const link = await createCheckoutLink({ merchantId, title: 'Donate', mode: 'live', amount: 500 })
    const result = await createCheckoutFromLink(link.slug)
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.amount).toBe(500)
    expect(result.verified_amount).toBe(500)
  })
})