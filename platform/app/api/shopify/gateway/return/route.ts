import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { TOROPAY_PUBLIC_URL } from '@/lib/checkout'
import { settleAndReturnToShopify, shopifyMeta } from '@/lib/shopify-payments-app'

export async function GET(request: NextRequest) {
  const session = request.nextUrl.searchParams.get('session') || ''
  if (!session) return NextResponse.redirect(`${TOROPAY_PUBLIC_URL}`, 302)

  const payment = await prisma.payment.findUnique({ where: { checkoutSessionId: session } })
  if (!payment) return NextResponse.redirect(`${TOROPAY_PUBLIC_URL}`, 302)

  const conn = await prisma.shopifyConnection.findUnique({ where: { merchantId: payment.merchantId } })
  const meta = shopifyMeta(payment)
  const cancelUrl = meta['shopify_cancel_url'] as string | null | undefined
  const fallback = cancelUrl || `${TOROPAY_PUBLIC_URL}/checkout/${session}`

  if (!conn?.accessToken) {
    return NextResponse.redirect(fallback, 302)
  }

  const result = await settleAndReturnToShopify({
    merchantId: payment.merchantId,
    paymentId: payment.id,
    conn: { storeDomain: conn.storeDomain, accessToken: conn.accessToken },
  })

  const destination = result.ok && result.redirectUrl ? result.redirectUrl : fallback
  return NextResponse.redirect(destination, 302)
}