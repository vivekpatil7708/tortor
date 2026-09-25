import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getShopifyConnectionByStoreDomain } from '@/lib/shopify'
import {
  createCheckoutFromShopifyPaymentSession,
  normalizeShopifyStore,
  verifyShopifyAppRequest,
  type ShopifyPaymentSessionPayload,
} from '@/lib/shopify-payments-app'

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const verified = verifyShopifyAppRequest(request.headers, rawBody)
  if (!verified.ok || !verified.domain) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const conn = await getShopifyConnectionByStoreDomain(normalizeShopifyStore(verified.domain))
  if (!conn || !conn.accessToken || !conn.enabled) {
    return NextResponse.json({ error: 'Store not connected' }, { status: 404 })
  }

  let payload: ShopifyPaymentSessionPayload
  try {
    payload = JSON.parse(rawBody) as ShopifyPaymentSessionPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const checkout = await createCheckoutFromShopifyPaymentSession(
      { merchantId: conn.merchantId, storeDomain: conn.storeDomain },
      payload
    )
    await prisma.shopifyConnection.update({
      where: { id: conn.id },
      data: { lastEventAt: new Date(), lastError: null },
    })
    return NextResponse.json({ redirect_url: checkout.checkout_url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start payment session'
    await prisma.shopifyConnection.update({
      where: { id: conn.id },
      data: { lastError: message },
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}