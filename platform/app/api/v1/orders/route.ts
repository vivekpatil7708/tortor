import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createCheckout } from '@/lib/checkout'
import { authorizeApiRequest, logApiRequest } from '@/lib/api-request'
import { apiError, badRequest } from '@/lib/api-response'
import { zodMessage } from '@/lib/zod-error'

const itemSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().int().positive(),
  unit_price: z.number().nonnegative(),
  product_id: z.string().max(100).optional().nullable(),
  sku: z.string().max(100).optional().nullable(),
  variant_attributes: z.record(z.string(), z.unknown()).optional().nullable(),
})

const createOrderSchema = z.object({
  merchant_order_reference: z.string().max(100).optional().nullable(),
  customer: z
    .object({
      name: z.string().max(200).optional().nullable(),
      email: z.string().email().optional().nullable(),
      phone: z.string().max(20).optional().nullable(),
    })
    .optional()
    .nullable(),
  items: z.array(itemSchema).min(1),
  currency: z.string().length(3).default('INR'),
  discount_amount: z.number().nonnegative().optional().default(0),
  shipping_amount: z.number().nonnegative().optional().default(0),
  tax_amount: z.number().nonnegative().optional().default(0),
  /**
   * Optional client-computed payable. If provided, the server re-prices the
   * items from the catalogue and rejects the checkout when this does not match.
   */
  total_amount: z.number().nonnegative().optional().nullable(),
  shipping_address: z.record(z.string(), z.unknown()).optional().nullable(),
  billing_address: z.record(z.string(), z.unknown()).optional().nullable(),
  success_url: z.string().url().optional().nullable(),
  cancel_url: z.string().url().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  expires_at: z.string().datetime().optional().nullable(),
  idempotency_key: z.string().max(100).optional().nullable(),
})

export async function POST(req: NextRequest) {
  const authorized = await authorizeApiRequest(req, 'write')
  if (authorized instanceof NextResponse) return authorized
  const { auth, mode } = authorized

  const route = '/api/v1/orders'
  const requestBody = await req.json().catch(() => null)

  const parsed = createOrderSchema.safeParse(requestBody)
  if (!parsed.success) {
    const statusCode = 400
    await logApiRequest({
      merchantId: auth.merchantId,
      apiKeyId: auth.apiKeyId,
      method: 'POST',
      route,
      statusCode,
      bodySummary: requestBody,
    })
    return badRequest(zodMessage(parsed.error) ?? 'Invalid request body')
  }
  const body = parsed.data

  try {
    const merchant = await prisma.merchant.findUnique({
      where: { id: auth.merchantId },
      include: { upiIds: true },
    })
    const hasActiveUpi = (merchant?.upiIds ?? []).some(u => u.status === 'active')
    const provider = hasActiveUpi ? 'upi' : 'mock'

    const result = await createCheckout({
      merchantId: auth.merchantId,
      mode,
      provider,
      merchantOrderReference: body.merchant_order_reference ?? null,
      customer: body.customer ?? null,
      items: body.items.map(i => ({
        productId: i.product_id ?? null,
        productName: i.name,
        quantity: i.quantity,
        unitPrice: i.unit_price,
        sku: i.sku ?? null,
      })),
      currency: body.currency,
      discountAmount: body.discount_amount,
      shippingAmount: body.shipping_amount,
      taxAmount: body.tax_amount,
      expectedTotal: body.total_amount ?? null,
      shippingAddress: body.shipping_address ?? null,
      billingAddress: body.billing_address ?? null,
      successUrl: body.success_url ?? null,
      cancelUrl: body.cancel_url ?? null,
      metadata: body.metadata ?? null,
      expiresAt: body.expires_at ? new Date(body.expires_at) : null,
      idempotencyKey: body.idempotency_key ?? null,
      orderSource: 'website_api',
    })

    const statusCode = result.reused ? 200 : 201
    const responseBody = {
      toropay_order_id: result.toropay_order_id,
      order_number: result.order_number,
      payment_reference: result.payment_reference,
      checkout_session_id: result.checkout_session_id,
      checkout_url: result.checkout_url,
      status: result.status,
      mode: result.mode,
      reused: result.reused,
      amount: result.amount,
      subtotal_amount: result.subtotal_amount,
      discount_amount: result.discount_amount,
      shipping_amount: result.shipping_amount,
      tax_amount: result.tax_amount,
      currency: result.currency,
      verified_amount: result.verified_amount,
    }

    await logApiRequest({
      merchantId: auth.merchantId,
      apiKeyId: auth.apiKeyId,
      method: 'POST',
      route,
      statusCode,
      bodySummary: requestBody,
    })

    return NextResponse.json(responseBody, { status: statusCode })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create order'
    const statusCode = message.includes('idempotency') ? 409 : 400
    await logApiRequest({
      merchantId: auth.merchantId,
      apiKeyId: auth.apiKeyId,
      method: 'POST',
      route,
      statusCode,
      bodySummary: requestBody,
    })
    return apiError(statusCode, message)
  }
}