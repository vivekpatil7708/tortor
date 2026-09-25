import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getShopifyConnectionByStoreDomain,
  verifyShopifyHmac,
  handleShopifyOrderCreated,
  handleShopifyOrderPaid,
  type ShopifyOrderPayload,
} from '@/lib/shopify'

const MAX_BODY_BYTES = 512 * 1024

/**
 * Public Shopify webhook endpoint. Signature-verified with the merchant's
 * stored shared secret, looked up by the shop domain header.
 */
export async function POST(req: NextRequest) {
  const topic = req.headers.get('x-shopify-topic') || ''
  const shopDomain = req.headers.get('x-shopify-shop-domain') || ''
  const signature = req.headers.get('x-shopify-hmac-sha256')

  if (!shopDomain || !signature) {
    return NextResponse.json({ error: 'Missing Shopify webhook headers' }, { status: 400 })
  }

  const bodyText = await req.text()
  if (bodyText.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  const conn = await getShopifyConnectionByStoreDomain(shopDomain)
  if (!conn || !conn.enabled) {
    return NextResponse.json({ error: 'Shop domain is not connected' }, { status: 404 })
  }

  if (!verifyShopifyHmac(bodyText, signature, conn.webhookSecret)) {
    await prisma.shopifyConnection.update({
      where: { id: conn.id },
      data: { lastError: 'Signature verification failed' },
    })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(bodyText || '{}') as ShopifyOrderPayload

  const errorSink = async (message: string) => {
    await prisma.shopifyConnection.update({
      where: { id: conn.id },
      data: { lastError: message.slice(0, 500) },
    })
  }

  try {
    if (topic === 'orders/create' && conn.topicOrdersCreate) {
      const result = await handleShopifyOrderCreated(conn, payload, errorSink)
      await prisma.shopifyConnection.update({ where: { id: conn.id }, data: { lastEventAt: new Date() } })
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })
      return NextResponse.json(result)
    }

    if (topic === 'orders/paid' && conn.topicOrdersPaid) {
      const result = await handleShopifyOrderPaid(conn, payload, errorSink)
      await prisma.shopifyConnection.update({ where: { id: conn.id }, data: { lastEventAt: new Date() } })
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })
      return NextResponse.json(result)
    }

    // Unknown or disabled topic — acknowledge so Shopify stops retrying.
    return NextResponse.json({ ok: true, ignored: topic })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to process Shopify webhook'
    await prisma.shopifyConnection.update({
      where: { id: conn.id },
      data: { lastError: message.slice(0, 500) },
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}