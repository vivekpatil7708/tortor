import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMerchant } from '@/lib/tenant'
import { handleError } from '@/lib/api-response'

// Delivery view: fulfillments needing action, ready-to-ship, in transit, delivered.
export async function GET(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const { searchParams } = new URL(req.url)
    const tab = searchParams.get('tab') ?? 'all'
    const search = searchParams.get('search') ?? undefined

    const where: Record<string, unknown> = { merchantId: session.id }
    if (tab === 'to_pack') where.status = { in: ['unfulfilled', 'processing', 'packed'] }
    if (tab === 'in_transit') where.status = { in: ['shipped', 'in_transit', 'out_for_delivery'] }
    if (tab === 'delivered') where.status = 'delivered'
    if (tab === 'issues') where.status = { in: ['delivery_failed', 'returned'] }
    if (search) where.trackingNumber = { contains: search, mode: 'insensitive' }

    const fulfillments = await prisma.fulfillment.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        order: { include: { customer: true } },
        items: { include: { orderItem: true } },
        packages: true,
      },
    })

    const rows = fulfillments.map(f => ({
      id: f.id,
      fulfillment_number: f.fulfillmentNumber,
      order_number: f.order.orderNumber,
      order_id: f.orderId,
      customer_name: f.order.customer?.fullName ?? 'Walk-in',
      status: f.status,
      fulfillment_type: f.fulfillmentType,
      item_count: f.items.reduce((s, i) => s + i.quantity, 0),
      tracking_number: f.packages[0]?.trackingNumber ?? null,
      courier_provider: f.packages[0]?.courierProvider ?? null,
      package_status: f.packages[0]?.packageStatus ?? 'not_shipped',
      estimated_delivery_at: f.packages[0]?.estimatedDeliveryAt?.toISOString() ?? null,
      shipped_at: f.packages[0]?.shippedAt?.toISOString() ?? null,
      delivered_at: f.packages[0]?.deliveredAt?.toISOString() ?? null,
      created_at: f.createdAt.toISOString(),
      updated_at: f.updatedAt.toISOString(),
    }))

    const counts = {
      all: await prisma.fulfillment.count({ where: { merchantId: session.id } }),
      to_pack: await prisma.fulfillment.count({ where: { merchantId: session.id, status: { in: ['unfulfilled', 'processing', 'packed'] } } }),
      in_transit: await prisma.fulfillment.count({ where: { merchantId: session.id, status: { in: ['shipped', 'in_transit', 'out_for_delivery'] } } }),
      delivered: await prisma.fulfillment.count({ where: { merchantId: session.id, status: 'delivered' } }),
      issues: await prisma.fulfillment.count({ where: { merchantId: session.id, status: { in: ['delivery_failed', 'returned'] } } }),
    }

    return NextResponse.json({ rows, counts })
  } catch (err) {
    return handleError(err)
  }
}