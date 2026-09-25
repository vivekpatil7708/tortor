import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth'
import { generateShopifyWebhookSecret, getShopifyConnectionByStoreDomain } from '@/lib/shopify'
import {
  exchangeShopifyAuthCode,
  getShopifyAppConfig,
  isValidShopifyStore,
  normalizeShopifyStore,
  verifyShopifyOAuthCallback,
} from '@/lib/shopify-payments-app'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const shop = normalizeShopifyStore(params.get('shop') || '')
  const code = params.get('code') || ''
  const state = params.get('state') || ''

  let config
  try {
    config = getShopifyAppConfig()
  } catch {
    return NextResponse.json({ error: 'Shopify app is not configured' }, { status: 503 })
  }

  if (!isValidShopifyStore(shop) || !code || !state) {
    return NextResponse.json({ error: 'Invalid callback parameters' }, { status: 400 })
  }

  if (!verifyShopifyOAuthCallback(params, config.apiSecret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  const cookieState = cookies().get('shopify_oauth_state')?.value
  cookies().delete('shopify_oauth_state')
  if (!cookieState || cookieState !== state) {
    return NextResponse.json({ error: 'State mismatch' }, { status: 403 })
  }

  let merchantId: string
  try {
    const session = await requireSession()
    merchantId = session.id
  } catch {
    return NextResponse.redirect(`${config.appOrigin}/login`)
  }

  const existing = await getShopifyConnectionByStoreDomain(shop)
  if (existing && existing.merchantId !== merchantId) {
    return NextResponse.json({ error: 'Store is already connected to another account' }, { status: 409 })
  }

  const accessToken = await exchangeShopifyAuthCode(shop, code)

  await prisma.shopifyConnection.upsert({
    where: { storeDomain: shop },
    update: {
      merchantId,
      accessToken,
      installedAt: new Date(),
      uninstalledAt: null,
      enabled: true,
      lastError: null,
    },
    create: {
      merchantId,
      storeDomain: shop,
      webhookSecret: generateShopifyWebhookSecret(),
      accessToken,
      installedAt: new Date(),
    },
  })

  return NextResponse.redirect(`${config.appOrigin}/dashboard/integrations?shopify=installed`)
}