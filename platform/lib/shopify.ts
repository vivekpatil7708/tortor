import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { createCheckout, TOROPAY_PUBLIC_URL } from '@/lib/checkout'
import { settlePaymentFromExternal } from '@/lib/payments/webhook-processor'
import { verifyAmount } from '@/lib/pricing'

export const SHOPIFY_WEBHOOK_PATH = '/api/webhooks/shopify'

export interface ShopifyConnectionView {
  connected: boolean
  store_domain: string | null
  webhook_secret: string | null
  topic_orders_create: boolean
  topic_orders_paid: boolean
  enabled: boolean
  webhook_url: string
  last_event_at: string | null
  last_error: string | null
  created_at: string
}

export function generateShopifyWebhookSecret(): string {
  return crypto.randomBytes(24).toString('hex')
}

/** Verify the Shopify `X-Shopify-Hmac-Sha256` signature (timing-safe). */
export function verifyShopifyHmac(rawBody: string | Buffer, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false
  const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(hmac, 'hex')
  const b = Buffer.from(signature, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function getShopifyConnection(merchantId: string) {
  return prisma.shopifyConnection.findUnique({ where: { merchantId } })
}

export async function getShopifyConnectionByStoreDomain(storeDomain: string) {
  // Shopify sends only the shop domain header; normalize to match stored value.
  const normalized = storeDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
  return prisma.shopifyConnection.findUnique({ where: { storeDomain: normalized } })
}

export function serializeShopifyConnection(conn: {
  id: string
  merchantId: string
  storeDomain: string
  webhookSecret: string
  topicOrdersCreate: boolean
  topicOrdersPaid: boolean
  enabled: boolean
  lastEventAt: Date | null
  lastError: string | null
  createdAt: Date
}): ShopifyConnectionView {
  return {
    connected: conn.enabled,
    store_domain: conn.storeDomain,
    webhook_secret: conn.webhookSecret,
    topic_orders_create: conn.topicOrdersCreate,
    topic_orders_paid: conn.topicOrdersPaid,
    enabled: conn.enabled,
    webhook_url: `${TOROPAY_PUBLIC_URL}${SHOPIFY_WEBHOOK_PATH}`,
    last_event_at: conn.lastEventAt?.toISOString() ?? null,
    last_error: conn.lastError,
    created_at: conn.createdAt.toISOString(),
  }
}

export interface ShopifyOrderPayload {
  id: number | string
  name?: string
  total_price?: string | number
  subtotal_price?: string | number
  total_discounts?: string | number
  total_tax?: string | number | null
  shipping_lines?: Array<{ price?: string | number }> | null
  line_items?: Array<{
    title?: string
    name?: string
    quantity?: number
    price?: string | number
    sku?: string | null
  }> | null
  customer?: {
    first_name?: string | null
    last_name?: string | null
    email?: string | null
    phone?: string | null
  } | null
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value)
  return 0
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Handle a Shopify `orders/create` webhook: re-prices every line (catalogue
 * sku match wins, Shopify price otherwise), recomputes the totals server-side
 * and verifies them against Shopify's own `total_price`. Returns the created /
 * reused ToroPay checkout. Idempotent on the Shopify order id.
 */
export async function handleShopifyOrderCreated(
  conn: { merchantId: string; storeDomain: string },
  payload: ShopifyOrderPayload,
  errorSink: (message: string) => Promise<void>
): Promise<{ ok: boolean; error?: string; checkout_session_id?: string; checkout_url?: string }> {
  const orderId = String(payload.id ?? '')
  if (!orderId) {
    await errorSink('Shopify payload missing order id')
    return { ok: false, error: 'Missing Shopify order id' }
  }

  const lineItems = Array.isArray(payload.line_items) && payload.line_items.length
    ? payload.line_items.map(li => ({
        productName: li.title || li.name || 'Shopify item',
        sku: li.sku || null,
        quantity: Math.max(1, Math.floor(li.quantity ?? 1)),
        unitPrice: toNumber(li.price),
      }))
    : [{ productName: `Shopify order #${orderId}`, sku: null, quantity: 1, unitPrice: toNumber(payload.total_price) }]

  const shipping = (payload.shipping_lines ?? []).reduce((sum, line) => sum + toNumber(line.price), 0)
  const discount = toNumber(payload.total_discounts)
  const tax = toNumber(payload.total_tax)
  const expectedTotal = toNumber(payload.total_price)

  // Pre-verify with the client-declared prices so a malformed payload fails
  // fast (and with a clear error) before the re-priced total is compared.
  const roughSubtotal = round2(lineItems.reduce((sum, li) => sum + round2(li.unitPrice * li.quantity), 0))
  const roughTotal = round2(roughSubtotal - discount + shipping + tax)
  if (expectedTotal > 0 && !verifyAmount(roughTotal, expectedTotal)) {
    await errorSink(`Shopify total (${expectedTotal}) does not match line items (${roughTotal})`)
    return { ok: false, error: 'Shopify order totals could not be reconciled' }
  }

  const customer = payload.customer
    ? {
        name: [payload.customer.first_name, payload.customer.last_name].filter(Boolean).join(' ') || null,
        email: payload.customer.email ?? null,
        phone: payload.customer.phone ?? null,
      }
    : null

  try {
    const result = await createCheckout({
      merchantId: conn.merchantId,
      mode: 'live',
      merchantOrderReference: `shopify:${orderId}`,
      idempotencyKey: `shopify_order_${orderId}`,
      customer,
      items: lineItems,
      shippingAmount: shipping,
      discountAmount: discount,
      taxAmount: tax,
      expectedTotal: expectedTotal > 0 ? expectedTotal : null,
      orderSource: 'website_api',
      metadata: { shopify: true, shopify_order_id: orderId, store_domain: conn.storeDomain },
    })

    return {
      ok: true,
      checkout_session_id: result.checkout_session_id,
      checkout_url: result.checkout_url,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create Shopify checkout'
    await errorSink(message)
    return { ok: false, error: message }
  }
}

/**
 * Handle a Shopify `orders/paid` webhook: finds the matching ToroPay payment
 * (by `shopify:<order id>` reference) and settles it as paid when still
 * pending. Idempotent.
 */
export async function handleShopifyOrderPaid(
  conn: { merchantId: string },
  payload: ShopifyOrderPayload,
  errorSink: (message: string) => Promise<void>
): Promise<{ ok: boolean; error?: string; payment_id?: string; changed?: boolean }> {
  const orderId = String(payload.id ?? '')
  if (!orderId) {
    await errorSink('Shopify payload missing order id')
    return { ok: false, error: 'Missing Shopify order id' }
  }

  const payment = await prisma.payment.findFirst({
    where: {
      merchantId: conn.merchantId,
      merchantOrderReference: `shopify:${orderId}`,
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!payment) {
    await errorSink(`No ToroPay payment for Shopify order ${orderId}`)
    return { ok: false, error: 'Payment not found for Shopify order' }
  }

  const settled = await settlePaymentFromExternal({
    paymentId: payment.id,
    merchantId: conn.merchantId,
    source: 'shopify',
    referenceId: orderId,
  })

  if (!settled.ok) {
    await errorSink(settled.error || 'Failed to settle Shopify payment')
    return { ok: false, error: settled.error || 'Failed to settle payment' }
  }

  return { ok: true, payment_id: payment.id, changed: settled.changed }
}