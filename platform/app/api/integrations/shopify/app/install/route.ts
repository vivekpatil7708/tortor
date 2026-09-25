import crypto from 'crypto'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import {
  buildShopifyAuthorizeUrl,
  getShopifyAppConfig,
  isShopifyAppConfigured,
  isValidShopifyStore,
  normalizeShopifyStore,
} from '@/lib/shopify-payments-app'

export async function GET(request: NextRequest) {
  try {
    await requireSession()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isShopifyAppConfigured()) {
    return NextResponse.json({ error: 'Shopify app is not configured' }, { status: 503 })
  }

  const shop = normalizeShopifyStore(request.nextUrl.searchParams.get('shop') || '')
  if (!isValidShopifyStore(shop)) {
    return NextResponse.json({ error: 'Invalid Shopify store domain' }, { status: 400 })
  }

  const state = crypto.randomBytes(24).toString('hex')
  cookies().set('shopify_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 300,
  })

  const config = getShopifyAppConfig()
  return NextResponse.redirect(buildShopifyAuthorizeUrl(shop, state))
}