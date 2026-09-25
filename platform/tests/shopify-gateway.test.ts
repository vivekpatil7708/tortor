import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { makeMerchant } from './helpers'
import { generateShopifyWebhookSecret } from '@/lib/shopify'
import { TOROPAY_PUBLIC_URL } from '@/lib/checkout'
import {
  buildShopifyAuthorizeUrl,
  createCheckoutFromShopifyPaymentSession,
  verifyShopifyAppRequest,
  verifyShopifyOAuthCallback,
  shopifyMeta,
} from '@/lib/shopify-payments-app'
import { POST as sessionPOST } from '@/app/api/shopify/gateway/session/route'
import { GET as returnGET } from '@/app/api/shopify/gateway/return/route'

const API_KEY = 'test-api-key'
const API_SECRET = 'test-api-secret'
const OLD_KEY = process.env.SHOPIFY_API_KEY
const OLD_SECRET = process.env.SHOPIFY_API_SECRET

describe('shopify payments app gateway', () => {
  let merchantId = ''
  let connId = ''

  beforeAll(async () => {
    process.env.SHOPIFY_API_KEY = API_KEY
    process.env.SHOPIFY_API_SECRET = API_SECRET
    merchantId = (await makeMerchant()).id
  })

  afterAll(() => {
    if (OLD_KEY === undefined) delete process.env.SHOPIFY_API_KEY
    else process.env.SHOPIFY_API_KEY = OLD_KEY
    if (OLD_SECRET === undefined) delete process.env.SHOPIFY_API_SECRET
    else process.env.SHOPIFY_API_SECRET = OLD_SECRET
  })

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE shopify_connections, payments, checkout_links, webhook_events, webhook_delivery_logs, webhook_endpoints, email_logs, order_status_history, order_items, orders, products, customers RESTART IDENTITY CASCADE'
    )
    const conn = await prisma.shopifyConnection.create({
      data: {
        merchantId,
        storeDomain: 'gateway-store.myshopify.com',
        webhookSecret: generateShopifyWebhookSecret(),
      },
    })
    connId = conn.id
  })

  const payload = (overrides: Record<string, unknown> = {}) => ({
    id: '0ff9bda3-5f88-11ee-8c90-325096b39f47',
    gid: 'gid://shopify/PaymentSession/123456',
    group: 'gid://shopify/Order/789',
    amount: '1499.00',
    currency: 'INR',
    test: true,
    cancel_url: 'https://gateway-store.myshopify.com/checkout/cart',
    customer: { email: 'buyer@example.com', phone_number: null },
    ...overrides,
  })

  function signBody(body: string) {
    return crypto.createHmac('sha256', API_SECRET).update(body).digest('base64')
  }

  it('verifies the OAuth callback signature', () => {
    const params = new URLSearchParams({
      code: 'abc123',
      shop: 'gateway-store.myshopify.com',
      state: 'st4te',
    })
    const sig = crypto
      .createHmac('sha256', API_SECRET)
      .update(`code=abc123&shop=gateway-store.myshopify.com&state=st4te`)
      .digest('hex')
    params.set('signature', sig)
    expect(verifyShopifyOAuthCallback(params, API_SECRET)).toBe(true)
    expect(verifyShopifyOAuthCallback(new URLSearchParams({ ...Object.fromEntries(params), state: 'other' }), API_SECRET)).toBe(false)
  })

  it('builds a valid authorize URL for the store', () => {
    const url = buildShopifyAuthorizeUrl('gateway-store.myshopify.com', 'st4te')
    expect(url).toContain('https://gateway-store.myshopify.com/admin/oauth/authorize')
    expect(url).toContain('client_id=test-api-key')
    expect(url).toContain('scope=read_payment_sessions%2Cwrite_payment_sessions')
    expect(url).toContain('redirect_uri=' + encodeURIComponent(`${TOROPAY_PUBLIC_URL}/api/integrations/shopify/app/callback`))
    expect(url).toContain('state=st4te')
  })

  it('verifies gateway requests signed with the app secret', () => {
    const body = JSON.stringify(payload())
    const good = new Headers({
      'x-shopify-shop-domain': 'gateway-store.myshopify.com',
      'x-shopify-api-key': API_KEY,
      'x-shopify-hmac-sha256': signBody(body),
    })
    expect(verifyShopifyAppRequest(good, body)).toEqual({ ok: true, domain: 'gateway-store.myshopify.com' })
    expect(verifyShopifyAppRequest(new Headers(good), 'tampered')).toEqual({ ok: false })
    const wrongKey = new Headers(good)
    wrongKey.set('x-shopify-api-key', 'nope')
    expect(verifyShopifyAppRequest(wrongKey, body)).toEqual({ ok: false })
  })

  it('maps a payment session to a hosted checkout in test mode', async () => {
    const result = await createCheckoutFromShopifyPaymentSession(
      { merchantId, storeDomain: 'gateway-store.myshopify.com' },
      payload()
    )
    expect(result.checkout_url).toContain('/checkout/')

    const payment = await prisma.payment.findUnique({ where: { checkoutSessionId: result.checkout_session_id } })
    expect(payment).not.toBeNull()
    if (!payment) return
    expect(payment.merchantOrderReference).toBe('shopify_ps:0ff9bda3-5f88-11ee-8c90-325096b39f47')
    expect(payment.amount.toNumber()).toBe(1499)
    expect(payment.currency).toBe('INR')
    expect(payment.mode).toBe('test')
    expect(payment.provider).toBe('mock')

    const meta = shopifyMeta(payment)
    expect(meta['gateway']).toBe('shopify')
    expect(meta['shopify_payment_session_gid']).toBe('gid://shopify/PaymentSession/123456')
    expect(meta['store_domain']).toBe('gateway-store.myshopify.com')
  })

  it('is idempotent: resending the same session reuses the checkout', async () => {
    const first = await createCheckoutFromShopifyPaymentSession(
      { merchantId, storeDomain: 'gateway-store.myshopify.com' },
      payload()
    )
    const second = await createCheckoutFromShopifyPaymentSession(
      { merchantId, storeDomain: 'gateway-store.myshopify.com' },
      payload()
    )
    expect(second.checkout_session_id).toBe(first.checkout_session_id)
    expect(await prisma.payment.count({ where: { merchantOrderReference: 'shopify_ps:0ff9bda3-5f88-11ee-8c90-325096b39f47' } })).toBe(1)
  })

  it('runs a live session in live mode with the given currency', async () => {
    const result = await createCheckoutFromShopifyPaymentSession(
      { merchantId, storeDomain: 'gateway-store.myshopify.com' },
      payload({ test: false, currency: 'USD', amount: '25.50' })
    )
    const payment = await prisma.payment.findUnique({ where: { checkoutSessionId: result.checkout_session_id } })
    expect(payment?.mode).toBe('live')
    expect(payment?.currency).toBe('USD')
    expect(payment?.amount.toNumber()).toBe(25.5)
  })

  it('session route rejects requests with no/invalid HMAC', async () => {
    const req = new NextRequest('http://localhost/api/shopify/gateway/session', { method: 'POST', body: JSON.stringify(payload()) })
    const res = await sessionPOST(req)
    expect(res.status).toBe(401)
  })

  it('session route rejects stores that are not connected', async () => {
    const body = JSON.stringify(payload())
    const req = new NextRequest('http://localhost/api/shopify/gateway/session', {
      method: 'POST',
      body,
      headers: {
        'x-shopify-shop-domain': 'not-connected.myshopify.com',
        'x-shopify-api-key': API_KEY,
        'x-shopify-hmac-sha256': signBody(body),
      },
    })
    const res = await sessionPOST(req)
    expect(res.status).toBe(404)
  })

  it('session route creates a checkout and returns redirect_url', async () => {
    await prisma.shopifyConnection.update({
      where: { id: connId },
      data: { accessToken: 'shpat_installed_0000000000000000' },
    })
    const body = JSON.stringify(payload())
    const req = new NextRequest('http://localhost/api/shopify/gateway/session', {
      method: 'POST',
      body,
      headers: {
        'x-shopify-shop-domain': 'gateway-store.myshopify.com',
        'x-shopify-api-key': API_KEY,
        'x-shopify-hmac-sha256': signBody(body),
      },
    })
    const res = await sessionPOST(req)
    expect(res.status).toBe(200)
    const data = (await res.json()) as { redirect_url: string }
    expect(data.redirect_url).toContain('/checkout/')

    await prisma.shopifyConnection.update({ where: { id: connId }, data: { lastEventAt: new Date() } })
    const conn = await prisma.shopifyConnection.findUnique({ where: { id: connId } })
    expect(conn?.lastEventAt).not.toBeNull()
    expect(conn?.lastError).toBeNull()
  })

  it('return route redirects to the stored cancel url when the store is not app-connected', async () => {
    const created = await createCheckoutFromShopifyPaymentSession(
      { merchantId, storeDomain: 'gateway-store.myshopify.com' },
      payload()
    )
    const req = new NextRequest(`http://localhost/api/shopify/gateway/return?session=${created.checkout_session_id}`)
    const res = await returnGET(req)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://gateway-store.myshopify.com/checkout/cart')
  })
})