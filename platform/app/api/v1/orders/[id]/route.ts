import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeApiRequest, logApiRequest } from '@/lib/api-request'
import { apiError, notFound } from '@/lib/api-response'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authorized = await authorizeApiRequest(req, 'read')
  if (authorized instanceof NextResponse) return authorized
  const { auth, mode } = authorized

  const orderId = (await ctx.params).id
  const route = `/api/v1/orders/${orderId}`

  const order = await prisma.order.findFirst({
    where: { id: orderId, merchantId: auth.merchantId, testMode: mode === 'test' },
    include: { orderItems: true, customer: true, payments: true },
  })

  if (!order) {
    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route,
      statusCode: 404 })
    return notFound('Order not found')
  }

  const responseBody = {
    id: order.id,
    order_number: order.orderNumber,
    status: order.orderStatus,
    payment_status: order.paymentStatus,
    created_at: order.createdAt.toISOString(),
    updated_at: order.updatedAt.toISOString(),
    customer: order.customer
      ? { name: order.customer.fullName, email: order.customer.email, phone: order.customer.phone }
      : null,
    items: order.orderItems.map(i => ({
      name: i.productNameSnapshot,
      sku: i.skuSnapshot,
      quantity: i.quantityOrdered,
      unit_price: i.unitPrice.toNumber(),
      line_total: i.lineTotal.toNumber(),
    })),
    currency: order.currency,
    subtotal_amount: order.subtotalAmount.toNumber(),
    discount_amount: order.discountAmount.toNumber(),
    shipping_amount: order.shippingAmount.toNumber(),
    tax_amount: order.taxAmount.toNumber(),
    total_amount: order.totalAmount.toNumber(),
    payments: order.payments.map(p => ({
      id: p.id,
      payment_reference: p.paymentReference,
      status: p.status,
      amount: p.amount.toNumber(),
      mode: p.mode,
      currency: p.currency,
      idempotency_key: p.idempotencyKey,
    })),
  }

  await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route,
      statusCode: 200 })
  return NextResponse.json(responseBody)
}