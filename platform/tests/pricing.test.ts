import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { makeMerchant, makeProduct } from './helpers'
import { createCheckout } from '@/lib/checkout'
import { resolveItemPrices, computeTotals, verifyAmount } from '@/lib/pricing'

describe('integration: authoritative backend pricing', () => {
  let merchantId = ''

  beforeAll(async () => {
    merchantId = (await makeMerchant()).id
  })

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE payments, checkout_links, webhook_events, webhook_delivery_logs, webhook_endpoints, email_logs, email_templates, order_status_history, order_items, orders, products, customers RESTART IDENTITY CASCADE'
    )
  })

  it('prices by product id from the catalogue, ignoring the client unit price', async () => {
    const product = await makeProduct(merchantId, { name: 'Catalog Tee', sku: 'SKU-TEE', price: 500 })
    const result = await createCheckout({
      merchantId,
      mode: 'live',
      items: [{ productId: product.id, productName: 'Client named tee', quantity: 2, unitPrice: 999 }],
    })

    expect(result.subtotal_amount).toBe(1000) // 500 * 2 — client's 999 ignored
    expect(result.verified_amount).toBe(1000)
    expect(result.amount).toBe(1000)

    const order = await prisma.order.findUnique({
      where: { id: result.toropay_order_id },
      include: { orderItems: true },
    })
    expect(order!.orderItems).toHaveLength(1)
    expect(order!.orderItems[0].unitPrice.toNumber()).toBe(500)
    expect(order!.orderItems[0].productId).toBe(product.id)
  })

  it('prices by sku when no product id is supplied, falling back to the client price for unknown lines', async () => {
    await makeProduct(merchantId, { name: 'Known', sku: 'SKU-KNOWN', price: 250 })
    const result = await createCheckout({
      merchantId,
      mode: 'live',
      items: [
        { productName: 'By sku', sku: 'SKU-KNOWN', quantity: 1, unitPrice: 999 },
        { productName: 'Unknown line', quantity: 2, unitPrice: 75.5 },
      ],
    })
    expect(result.subtotal_amount).toBeCloseTo(401, 0) // 250 + 2 * 75.5
  })

  it('rejects a checkout whose client-sent total does not match the server-computed total', async () => {
    const failing = createCheckout({
      merchantId,
      mode: 'live',
      items: [{ productName: 'Gadget', quantity: 1, unitPrice: 100 }],
      expectedTotal: 109.5, // client tampered with the amount
    })
    await expect(failing).rejects.toThrow(/Amount verification failed/)
  })

  it('accepts a correct client-sent total', async () => {
    const result = await createCheckout({
      merchantId,
      mode: 'live',
      items: [{ productName: 'Gadget', quantity: 2, unitPrice: 100 }],
      discountAmount: 10,
      shippingAmount: 20,
      taxAmount: 15,
      expectedTotal: 225, // 200 - 10 + 20 + 15
    })
    expect(result.verified_amount).toBe(225)
    expect(result.discount_amount).toBe(10)
    expect(result.shipping_amount).toBe(20)
    expect(result.tax_amount).toBe(15)
  })

  it('exposes subtotal/discount/shipping/tax/verified amounts on the response', async () => {
    const result = await createCheckout({
      merchantId,
      mode: 'live',
      items: [{ productName: 'Bundle', quantity: 1, unitPrice: 333.33 }],
      shippingAmount: 12,
    })
    expect(result.subtotal_amount).toBeCloseTo(333.33, 2)
    expect(result.shipping_amount).toBe(12)
    expect(result.amount).toBeCloseTo(345.33, 2)
    expect(result.verified_amount).toBeCloseTo(345.33, 2)
  })

  it('rounds exactly at the paise level for float-prone totals', async () => {
    expect(verifyAmount(499.5, 499.5)).toBe(true)
    expect(verifyAmount(123.459, 123.46)).toBe(true)
    expect(verifyAmount(100, 100.01)).toBe(false)
  })

  it('returns repriced line items with a source marker from resolveItemPrices', async () => {
    const product = await makeProduct(merchantId, { name: 'P', sku: 'SKU-SRC', price: 80 })
    const priced = await resolveItemPrices({
      merchantId,
      items: [
        { productId: product.id, productName: 'Catalog', unitPrice: 10, quantity: 1 },
        { productName: 'Manual', unitPrice: 25, quantity: 3 },
      ],
    })
    expect(priced.items[0].unitPrice).toBe(80)
    expect(priced.items[0].source).toBe('catalog')
    expect(priced.items[1].source).toBe('client')
    expect(priced.repriced).toBe(1)
    expect(priced.subtotal).toBe(155)
    expect(computeTotals({ items: priced.items, shippingAmount: 5 }).total).toBe(160)
  })
})