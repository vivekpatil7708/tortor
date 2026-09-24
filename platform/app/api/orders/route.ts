import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMerchant } from '@/lib/tenant'
import { createOrder } from '@/lib/orders'
import { createOrderSchema, orderListQuerySchema } from '@/lib/validators'
import { serializeOrder } from '@/lib/serializers'
import { badRequest, handleError } from '@/lib/api-response'
import { zodMessage } from '@/lib/zod-error'
import { getOwnerUser } from '@/lib/tenant'

export async function GET(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const { searchParams } = new URL(req.url)
    const q = orderListQuerySchema.parse({
      search: searchParams.get('search') ?? undefined,
      payment_status: searchParams.get('payment_status') ?? undefined,
      order_status: searchParams.get('order_status') ?? undefined,
      fulfillment_status: searchParams.get('fulfillment_status') ?? undefined,
      source: searchParams.get('source') ?? undefined,
      date_from: searchParams.get('date_from') ?? undefined,
      date_to: searchParams.get('date_to') ?? undefined,
      sort: searchParams.get('sort') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      page_size: searchParams.get('page_size') ?? undefined,
    })

    const where: Record<string, unknown> = { merchantId: session.id }
    if (q.payment_status) where.paymentStatus = q.payment_status
    if (q.order_status) where.orderStatus = q.order_status
    if (q.fulfillment_status) where.fulfillmentSummaryStatus = q.fulfillment_status
    if (q.source) where.source = q.source
    if (q.date_from || q.date_to) {
      where.createdAt = {
        ...(q.date_from ? { gte: new Date(q.date_from) } : {}),
        ...(q.date_to ? { lte: new Date(q.date_to) } : {}),
      }
    }

    // Search: order number / customer name / phone / email / tracking number.
    // Tracking number lives on packages, so we can not use a trivial Prisma filter
    // for that case — fall back to scanning order ids via package lookup.
    let orderIdFilter: string[] | null = null
    if (q.search) {
      const term = q.search
      const trackingOrders = await prisma.package.findMany({
        where: { merchantId: session.id, trackingNumber: { contains: term, mode: 'insensitive' } },
        select: { fulfillment: { select: { orderId: true } } },
      })
      orderIdFilter = Array.from(new Set(trackingOrders.map(p => p.fulfillment.orderId)))
      where.OR = [
        { orderNumber: { contains: term, mode: 'insensitive' } },
        { customer: { fullName: { contains: term, mode: 'insensitive' } } },
        { customer: { phone: { contains: term, mode: 'insensitive' } } },
        { customer: { email: { contains: term, mode: 'insensitive' } } },
        ...(orderIdFilter.length ? [{ id: { in: orderIdFilter } }] : []),
      ]
    }

    const orderBy =
      q.sort === 'oldest' ? { createdAt: 'asc' as const }
      : q.sort === 'amount' ? { totalAmount: 'desc' as const }
      : { createdAt: 'desc' as const }

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.page_size,
        take: q.page_size,
        include: {
          customer: true,
          orderItems: true,
          fulfillments: { include: { packages: true, items: true } },
        },
      }),
    ])

    return NextResponse.json({
      orders: orders.map(o => ({
        ...serializeOrder(o),
        item_count: o.orderItems.reduce((s, i) => s + i.quantityOrdered, 0),
        delivery_summary: o.fulfillments.map(f => ({
          id: f.id,
          fulfillment_number: f.fulfillmentNumber,
          status: f.status,
          fulfillment_type: f.fulfillmentType,
          tracking_number: f.packages[0]?.trackingNumber ?? null,
        })),
      })),
      total,
      page: q.page,
      page_size: q.page_size,
      total_pages: Math.max(1, Math.ceil(total / q.page_size)),
    })
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const body = createOrderSchema.parse(await req.json())
    const owner = await getOwnerUser(session.id)

    const order = await createOrder({
      merchantId: session.id,
      actorUserId: owner?.id ?? null,
      customerId: body.customer_id ?? null,
      customer: body.customer ? {
        fullName: body.customer.full_name,
        phone: body.customer.phone ?? null,
        email: body.customer.email ?? null,
      } : null,
      source: body.source,
      items: body.items.map(i => ({
        productId: i.product_id ?? null,
        productName: i.product_name,
        sku: i.sku ?? null,
        unitPrice: i.unit_price,
        quantity: i.quantity,
      })),
      discountAmount: body.discount_amount,
      shippingAmount: body.shipping_amount,
      taxAmount: body.tax_amount,
      shippingAddress: body.shipping_address ?? null,
      billingAddress: body.billing_address ?? null,
      internalNotes: body.internal_notes ?? null,
      customerNote: body.customer_note ?? null,
      paymentStatus: body.payment_status,
      orderStatus: body.order_status,
    })

    if (!order) return badRequest('Order could not be created')
    return NextResponse.json({ order: serializeOrder(order) })
  } catch (err) {
    const msg = zodMessage(err)
    if (msg) return badRequest(msg)
    return handleError(err)
  }
}