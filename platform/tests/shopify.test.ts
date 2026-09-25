import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { makeMerchant, makeProduct } from './helpers'
import { verifyShopifyHmac, generateShopifyWebhookSecret, handleShopifyOrderCreated, handleShopifyOrderPaid } from '@/lib/shopify'
import { POST as shopifyWebhookPOST } from '@/app/api/webhooks/shopify/route'

describe('shopify guided webhook integration', () => {
  let merchantId = ''
  let connId = ''
  let secret = ''

  beforeAll(async () => {
    merchantId = (await makeMerchant()).id
  })

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE shopify_connections, payments, checkout_links, webhook_events, webhook_delivery_logs, webhook_endpoints, email_logs, order_status_history, order_items, orders, products, customers RESTART IDENTITY CASCADE'
    )
    secret = generateShopifyWebhookSecret()
    const conn = await prisma.shopifyConnection.create({
      data: {
        merchantId,
        storeDomain: 'demo-store.myshopify.com',
        webhookSecret: secret,
      },
    })
    connId = conn.id
  })

  function sign(body: string, sigSecret: string) {
    return crypto.createHmac('sha256', sigSecret).update(body).digest('hex')
  }

  function sampleOrder(id: number, overrides: Record<string, unknown> = {}) {
    return {
      id,
      name: `#${id}`,
      total_price: '1000.00',
      subtotal_price: '1000.00',
      total_discounts: '0.00',
      total_tax: '0.00',
      shipping_lines: [],
      line_items: [{ title: 'Shirt', quantity: 2, price: '500.00', sku: 'SHIRT-SHOP' }],
      customer: { first_name: 'Shop', last_name: 'User', email: 'shop@test.dev', phone: null },
      ...overrides,
    }
  }

  it('verifies HMAC signatures correctly', () => {
    const body = JSON.stringify({ hello: 'world' })
    const good = crypto.createHmac('sha256', 's3cret').update(body).digest('hex')
    expect(verifyShopifyHmac(body, good, 's3cret')).toBe(true)
    expect(verifyShopifyHmac(body, good, 'wrong')).toBe(false)
    expect(verifyShopifyHmac(body, null, 's3cret')).toBe(false)
  })

  it('orders/create re-prices from the catalogue, verifies totals and stores a shopify reference', async () => {
    const product = await makeProduct(merchantId, { name: 'Shirt', sku: 'SHIRT-SHOP', price: 500 })
    const result = await handleShopifyOrderCreated(
      { merchantId, storeDomain: 'demo-store.myshopify.com' },
      sampleOrder(1001),
      async () => {}
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const payment = await prisma.payment.findFirst({ where: { merchantOrderReference: 'shopify:1001' } })
    expect(payment).not.toBeNull()
    expect(payment!.amount.toNumber()).toBe(1000)
    expect(payment!.checkoutLinkId).toBeNull()

    const order = await prisma.order.findUnique({ where: { id: payment!.orderId! }, include: { orderItems: true } })
    expect(order!.orderItems).toHaveLength(1)
    expect(order!.orderItems[0].unitPrice.toNumber()).toBe(500)
    expect(order!.orderItems[0].productId).toBe(product.id)
  })

  it('rejects a Shopify order whose declared total cannot be reconciled', async () => {
    const bad = await handleShopifyOrderCreated(
      { merchantId, storeDomain: 'demo-store.myshopify.com' },
      sampleOrder(1002, { total_price: '999.00', line_items: [{ title: 'X', quantity: 1, price: '500.00' }] }),
      async () => {}
    )
    expect(bad.ok).toBe(false)
  })

  it('is idempotent: resending orders/create returns the same checkout', async () => {
    const first = await handleShopifyOrderCreated(
      { merchantId, storeDomain: 'demo-store.myshopify.com' },
      sampleOrder(1003),
      async () => {}
    )
    const second = await handleShopifyOrderCreated(
      { merchantId, storeDomain: 'demo-store.myshopify.com' },
      sampleOrder(1003),
      async () => {}
    )
    expect(second.ok).toBe(true)
    if (first.ok && second.ok) {
      expect(second.checkout_session_id).toBe(first.checkout_session_id)
    }
    expect(await prisma.payment.count({ where: { merchantOrderReference: 'shopify:1003' } })).toBe(1)
  })

  it('orders/paid settles the matching payment and order', async () => {
    await handleShopifyOrderCreated(
      { merchantId, storeDomain: 'demo-store.myshopify.com' },
      sampleOrder(1004),
      async () => {}
    )

    const paid = await handleShopifyOrderPaid({ merchantId }, sampleOrder(1004), async () => {})
    expect(paid.ok).toBe(true)
    if (!paid.ok) return
    expect(paid.changed).toBe(true)

    const payment = await prisma.payment.findFirst({ where: { merchantOrderReference: 'shopify:1004' } })
    expect(payment!.status).toBe('paid')
    const order = await prisma.order.findUnique({ where: { id: payment!.orderId! } })
    expect(order!.paymentStatus).toBe('paid')

    // settling again is a no-op
    const again = await handleShopifyOrderPaid({ merchantId }, sampleOrder(1004), async () => {})
    expect(again.ok).toBe(true)
    if (again.ok) expect(again.changed).toBe(false)
  })

  it('orders/paid without a matching payment errors cleanly', async () => {
    const result = await handleShopifyOrderPaid({ merchantId }, sampleOrder(9999), async () => {})
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Payment not found')
  })

  it('public webhook route enforces the HMAC + shop lookup', async () => {
    const goodBody = JSON.stringify(sampleOrder(2001))
    const badBody = JSON.stringify(sampleOrder(2002))
    const unknownBody = JSON.stringify(sampleOrder(2003))

    const good = await shopifyWebhookPOST(
      new NextRequest('https://checkout.toropay.co.in/api/webhooks/shopify', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-shopify-topic': 'orders/create',
          'x-shopify-shop-domain': 'demo-store.myshopify.com',
          'x-shopify-hmac-sha256': sign(goodBody, secret),
        },
        body: goodBody,
      })
    )
    expect(good.status).toBe(200)
    const goodJson = (await good.json()) as { ok?: boolean; checkout_session_id?: string }
    expect(goodJson.checkout_session_id).toMatch(/^cs_/)

    const bad = await shopifyWebhookPOST(
      new NextRequest('https://checkout.toropay.co.in/api/webhooks/shopify', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-shopify-topic': 'orders/create',
          'x-shopify-shop-domain': 'demo-store.myshopify.com',
          'x-shopify-hmac-sha256': sign(badBody, 'wrong-secret'),
        },
        body: badBody,
      })
    )
    expect(bad.status).toBe(401)
    expect(await prisma.payment.count({ where: { merchantOrderReference: 'shopify:2002' } })).toBe(0)

    const unknown = await shopifyWebhookPOST(
      new NextRequest('https://checkout.toropay.co.in/api/webhooks/shopify', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-shopify-topic': 'orders/create',
          'x-shopify-shop-domain': 'other.myshopify.com',
          'x-shopify-hmac-sha256': sign(unknownBody, secret),
        },
        body: unknownBody,
      })
    )
    expect(unknown.status).toBe(404)
    // Only the signed request for the connected shop created a checkout.
    expect(await prisma.payment.count()).toBe(1)
  })
})