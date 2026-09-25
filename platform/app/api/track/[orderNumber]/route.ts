import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleError, notFound } from '@/lib/api-response'

// Simple in-memory rate limit for the public tracking endpoint.
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 30
const ipHits = new Map<string, { count: number; resetAt: number }>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = ipHits.get(ip)
  if (!entry || entry.resetAt < now) {
    ipHits.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  entry.count++
  if (entry.count > MAX_PER_WINDOW) return true
  return false
}

// GET /api/track/[orderNumber]?token=...
export async function GET(req: NextRequest, { params }: { params: { orderNumber: string } }) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 })
  }

  const orderNumber = params.orderNumber
  const token = req.nextUrl.searchParams.get('token')

  try {
    if (!orderNumber || !token) return notFound('Tracking link is invalid')

    const order = await prisma.order.findFirst({
      where: { orderNumber },
      select: {
        id: true,
        merchantId: true,
        orderNumber: true,
        trackingToken: true,
        createdAt: true,
        currency: true,
        totalAmount: true,
        fulfillmentSummaryStatus: true,
        orderStatus: true,
        customerNote: true,
        shippingAddressSnapshot: true,
        orderItems: true,
        customer: { select: { fullName: true } },
        fulfillments: {
          include: {
            items: { include: { orderItem: true } },
            packages: { include: { events: { orderBy: { eventAt: 'asc' } } } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!order || !order.trackingToken) return notFound('Tracking link is invalid')
    // Timing-safe comparison is not available via web crypto easily for strings;
    // jose uses subtle, so we compare with a constant-time style check here.
    const expected = order.trackingToken
    if (token.length !== expected.length) return notFound('Tracking link is invalid')
    let diff = 0
    for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i)
    if (diff !== 0) return notFound('Tracking link is invalid')

    const merchant = await prisma.merchant.findUnique({
      where: { id: order.merchantId },
      select: { businessName: true, businessLogoUrl: true, supportEmail: true, supportPhone: true },
    })

    // Build a customer-safe payload. NO internal notes, NO payment ids, NO audit,
    // NO raw merchant data, NO package ids.
    const fulfillments = order.fulfillments.map(f => ({
      id: f.id,
      fulfillment_number: f.fulfillmentNumber, // safe-ish: user-facing label "Shipment 1"
      fulfillment_type: f.fulfillmentType,
      status: f.status,
      items: f.items.map(fi => ({
        name: fi.orderItem.productNameSnapshot,
        quantity: fi.quantity,
      })),
      packages: f.packages.map(p => ({
        courier_provider: p.courierProvider,
        provider: p.provider,
        tracking_number: p.trackingNumber ?? p.awbNumber ?? null,
        awb_number: p.awbNumber ?? null,
        tracking_url: p.trackingUrl,
        package_status: p.packageStatus,
        estimated_delivery_at: p.estimatedDeliveryAt?.toISOString() ?? null,
        return_tracking_number: p.returnTrackingNumber ?? null,
        events: p.events.map(e => ({
          label: e.eventLabel,
          status: e.eventStatus,
          location: e.location,
          at: e.eventAt.toISOString(),
        })),
      })),
    }))

    return NextResponse.json({
      order: {
        order_number: order.orderNumber,
        created_at: order.createdAt.toISOString(),
        currency: order.currency,
        total_amount: order.totalAmount.toNumber(),
        fulfillment_summary_status: order.fulfillmentSummaryStatus,
        order_status: order.orderStatus,
        customer_name: order.customer?.fullName ?? null,
        customer_note: order.customerNote,
        shipping_address: order.shippingAddressSnapshot,
      },
      merchant: {
        business_name: merchant?.businessName ?? '',
        logo_url: merchant?.businessLogoUrl ?? null,
        support_email: merchant?.supportEmail ?? null,
        support_phone: merchant?.supportPhone ?? null,
      },
      items: order.orderItems.map(i => ({
        name: i.productNameSnapshot,
        sku: i.skuSnapshot,
        quantity: i.quantityOrdered,
        unit_price: i.unitPrice.toNumber(),
        line_total: i.lineTotal.toNumber(),
      })),
      fulfillments,
    })
  } catch (err) {
    return handleError(err)
  }
}