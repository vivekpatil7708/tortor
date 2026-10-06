import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getProvider, isSupportedPaymentMethod } from '@/lib/payments'
import { updateCheckoutCustomer, TOROPAY_PUBLIC_URL } from '@/lib/checkout'
import { apiError, badRequest, notFound } from '@/lib/api-response'

/**
 * Begin the payment on the checkout page:
 *  - saves the customer details
 *  - (re)initialises the provider payment session
 *  - returns the URL the customer should be sent to
 */
export async function POST(req: NextRequest, ctx: { params: { session: string } }) {
  const body = (await req.json().catch(() => null)) as
    | { name?: string; email?: string; phone?: string; method?: string }
    | null

  const view = await updateCheckoutCustomer({
    checkoutSessionId: ctx.params.session,
    name: body?.name ?? null,
    email: body?.email ?? null,
    phone: body?.phone ?? null,
  })
  if (!view) return notFound('Checkout not found or expired')

  if (view.payment.status !== 'pending' && view.payment.status !== 'processing') {
    return apiError(409, `Checkout already has status ${view.payment.status}`)
  }

  const method = body?.method ?? 'mock'
  if (!isSupportedPaymentMethod(method)) return badRequest('Unsupported payment method')

  const payment = await prisma.payment.findUnique({
    where: { checkoutSessionId: ctx.params.session },
    include: { order: true },
  })
  if (!payment) return notFound('Checkout not found')

  const adapter = getProvider(payment.provider as 'mock' | 'upi' | 'razorpay' | 'cashfree')

  try {
    const session = await adapter.createCheckoutSession({
      merchantId: payment.merchantId,
      orderId: payment.orderId || '',
      paymentId: payment.id,
      checkoutSessionId: payment.checkoutSessionId,
      paymentReference: payment.paymentReference,
      amount: payment.amount.toNumber(),
      currency: payment.currency,
      mode: payment.mode,
      customer: body ?? null,
      successUrl: `${TOROPAY_PUBLIC_URL}/checkout/${payment.checkoutSessionId}/success`,
      cancelUrl: `${TOROPAY_PUBLIC_URL}/checkout/${payment.checkoutSessionId}/cancel`,
      expiresAt: payment.expiresAt,
    })

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: session.providerPaymentId,
        providerOrderId: session.providerOrderId ?? null,
        providerCheckoutSessionId: session.providerCheckoutSessionId ?? null,
        paymentLinkUrl: session.checkoutUrl ?? null,
        paymentMethod: method,
        status: session.status,
        providerResponse: (session.providerResponse as Prisma.InputJsonValue | undefined) ?? undefined,
      },
    })

    const absoluteCheckoutUrl = session.checkoutUrl?.startsWith('http')
      ? session.checkoutUrl
      : `${TOROPAY_PUBLIC_URL}${session.checkoutUrl ?? ''}`

    return NextResponse.json({
      checkout_url: absoluteCheckoutUrl,
      status: session.status,
      provider: payment.provider,
      mode: payment.mode,
      payment_reference: payment.paymentReference,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to initialise payment'
    return apiError(500, message)
  }
}