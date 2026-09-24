import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMerchant, getOwnerUser } from '@/lib/tenant'
import { handleError } from '@/lib/api-response'

// KPI cards: total orders, paid orders, pending payment, to pack, in transit,
// delivered, total sales. Recent orders + needs action + low stock + quick actions.
export async function GET(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const { searchParams } = new URL(req.url)
    const days = Number(searchParams.get('days') || '30')

    const since = new Date()
    since.setDate(since.getDate() - days)

    const [totalOrders, paidOrders, pendingOrders, toPack, inTransit, delivered, salesAgg, recentOrders, actionOrders, lowStock, merchant] = await Promise.all([
      prisma.order.count({ where: { merchantId: session.id, createdAt: { gte: since } } }),
      prisma.order.count({ where: { merchantId: session.id, paymentStatus: 'paid', createdAt: { gte: since } } }),
      prisma.order.count({ where: { merchantId: session.id, paymentStatus: 'pending', createdAt: { gte: since } } }),
      prisma.order.count({
        where: {
          merchantId: session.id,
          createdAt: { gte: since },
          fulfillments: { some: { status: { in: ['processing', 'packed', 'unfulfilled'] } } },
        },
      }),
      prisma.order.count({
        where: {
          merchantId: session.id,
          createdAt: { gte: since },
          fulfillments: { some: { status: { in: ['shipped', 'in_transit', 'out_for_delivery'] } } },
        },
      }),
      prisma.order.count({
        where: {
          merchantId: session.id,
          createdAt: { gte: since },
          fulfillments: { some: { status: 'delivered' } },
        },
      }),
      prisma.order.aggregate({
        where: { merchantId: session.id, createdAt: { gte: since }, orderStatus: { not: 'cancelled' }, paymentStatus: 'paid' },
        _sum: { totalAmount: true },
      }),
      prisma.order.findMany({
        where: { merchantId: session.id },
        orderBy: { createdAt: 'desc' },
        take: 6,
        include: {
          customer: true,
          orderItems: { select: { quantityOrdered: true } },
          fulfillments: { include: { packages: true } },
        },
      }),
      prisma.order.findMany({
        where: {
          merchantId: session.id,
          orderStatus: { notIn: ['completed', 'cancelled'] },
          OR: [
            { orderStatus: 'pending_payment' },
            { fulfillments: { some: { status: { in: ['unfulfilled', 'processing', 'packed', 'delivery_failed', 'returned'] } } } },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: 8,
        include: { customer: true, fulfillments: true },
      }),
      prisma.product.findMany({
        where: {
          merchantId: session.id,
          status: 'active',
          stockQuantity: { not: null },
          lowStockThreshold: { not: null },
        },
        orderBy: { stockQuantity: 'asc' },
        take: 5,
      }),
      prisma.merchant.findUnique({ where: { id: session.id } }),
    ])

    const totalSales = salesAgg._sum.totalAmount?.toNumber() ?? 0

    return NextResponse.json({
      kpis: {
        total_orders: totalOrders,
        paid_orders: paidOrders,
        pending_payment_orders: pendingOrders,
        orders_to_pack: toPack,
        orders_in_transit: inTransit,
        delivered_orders: delivered,
        total_sales: totalSales,
      },
      recent_orders: recentOrders.map(o => ({
        id: o.id,
        order_number: o.orderNumber,
        customer_name: o.customer?.fullName ?? 'Walk-in',
        total_amount: o.totalAmount.toNumber(),
        payment_status: o.paymentStatus,
        order_status: o.orderStatus,
        fulfillment_summary_status: o.fulfillmentSummaryStatus,
        created_at: o.createdAt.toISOString(),
        item_count: o.orderItems.reduce((s, i) => s + i.quantityOrdered, 0),
        source: o.source,
      })),
      needs_action: actionOrders.map(o => ({
        id: o.id,
        order_number: o.orderNumber,
        customer_name: o.customer?.fullName ?? 'Walk-in',
        total_amount: o.totalAmount.toNumber(),
        payment_status: o.paymentStatus,
        order_status: o.orderStatus,
        fulfillment_summary_status: o.fulfillmentSummaryStatus,
        created_at: o.createdAt.toISOString(),
      })),
      low_stock_products: lowStock.map(p => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        stock_quantity: p.stockQuantity,
        low_stock_threshold: p.lowStockThreshold,
      })),
      merchant: {
        id: merchant?.id,
        business_name: merchant?.businessName,
        email: merchant?.email,
      },
    })
  } catch (err) {
    return handleError(err)
  }
}