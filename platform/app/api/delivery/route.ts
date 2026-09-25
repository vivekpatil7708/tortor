import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMerchant } from '@/lib/tenant'
import { handleError } from '@/lib/api-response'
import type { FulfillmentStatus, Prisma } from '@prisma/client'

// Delivery view — package-level rows so partially fulfilled / multi-package
// orders appear correctly. Every package in a shipping fulfillment gets its own
// row, searchable by tracking number or AWB, filterable by courier.
export async function GET(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const { searchParams } = new URL(req.url)
    const tab = (searchParams.get('tab') ?? 'all') as TabKey
    const search = searchParams.get('search') ?? undefined
    const courier = searchParams.get('courier') ?? undefined
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
    const perPage = Math.min(50, Math.max(5, Number(searchParams.get('per_page') ?? '20')))

    const fulfillmentFilter: Prisma.FulfillmentWhereInput = { merchantId: session.id }
    if (tab !== 'all') fulfillmentFilter.status = FULFILLMENT_STATES[tab].status

    const where: Prisma.PackageWhereInput = { fulfillment: fulfillmentFilter }
    if (search) {
      where.OR = [
        { trackingNumber: { contains: search, mode: 'insensitive' } },
        { awbNumber: { contains: search, mode: 'insensitive' } },
        { fulfillment: { order: { orderNumber: { contains: search, mode: 'insensitive' } } } },
        { providerShipmentId: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (courier && courier !== 'all') {
      where.OR = [...(where.OR ?? []), { courierProvider: courier }]
    }

    const [packages, total] = await Promise.all([
      prisma.package.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          fulfillment: {
            include: {
              order: { include: { customer: { select: { id: true, fullName: true, email: true, phone: true } } } },
              items: { include: { orderItem: true } },
            },
          },
        },
      }),
      prisma.package.count({ where }),
    ])

    const rows = packages.map(p => ({
      id: p.id,
      package_id: p.id,
      fulfillment_id: p.fulfillmentId,
      fulfillment_number: p.fulfillment.fulfillmentNumber,
      order_number: p.fulfillment.order.orderNumber,
      order_id: p.fulfillment.orderId,
      customer_name: p.fulfillment.order.customer?.fullName ?? 'Walk-in',
      order_status: p.fulfillment.order.orderStatus,
      fulfillment_status: p.fulfillment.status,
      fulfillment_type: p.fulfillment.fulfillmentType,
      item_count: p.fulfillment.items.reduce((s, i) => s + i.quantity, 0),
      tracking_number: p.trackingNumber ?? p.awbNumber ?? null,
      awb_number: p.awbNumber ?? null,
      courier_provider: p.courierProvider ?? null,
      provider: p.provider ?? null,
      package_status: p.packageStatus,
      estimated_delivery_at: p.estimatedDeliveryAt?.toISOString() ?? null,
      shipped_at: p.shippedAt?.toISOString() ?? null,
      picked_up_at: p.pickedUpAt?.toISOString() ?? null,
      delivered_at: p.deliveredAt?.toISOString() ?? null,
      rto_initiated_at: p.rtoInitiatedAt?.toISOString() ?? null,
      label_url: p.labelUrl ?? null,
      return_tracking_number: p.returnTrackingNumber ?? null,
      last_provider_sync_at: p.lastProviderSyncAt?.toISOString() ?? null,
      created_at: p.createdAt.toISOString(),
      updated_at: p.updatedAt.toISOString(),
    }))

    const countEntries = await Promise.all(
      (TABS as TabKey[]).map(async key => {
        const count = tabWhere(session.id, key)
        const totalCount = await prisma.package.count({ where: { fulfillment: count } })
        return [key, totalCount] as const
      })
    )
    const counts = Object.fromEntries(countEntries)

    return NextResponse.json({ rows, counts, pagination: { page, per_page: perPage, total, pages: Math.max(1, Math.ceil(total / perPage)) }, total })
  } catch (err) {
    return handleError(err)
  }
}

type TabKey = 'all' | 'to_pack' | 'in_transit' | 'delivered' | 'issues'

const TABS: TabKey[] = ['all', 'to_pack', 'in_transit', 'delivered', 'issues']

const FULFILLMENT_STATES: Record<Exclude<TabKey, 'all'>, { status: FulfillmentStatus | { in: FulfillmentStatus[] } }> = {
  to_pack: { status: { in: ['unfulfilled', 'processing', 'packed'] } },
  in_transit: { status: { in: ['shipped', 'in_transit', 'out_for_delivery'] } },
  delivered: { status: 'delivered' },
  issues: { status: { in: ['delivery_failed', 'returned'] } },
}

function tabWhere(merchantId: string, key: TabKey): Prisma.FulfillmentWhereInput {
  return key === 'all' ? { merchantId } : { merchantId, status: FULFILLMENT_STATES[key].status }
}