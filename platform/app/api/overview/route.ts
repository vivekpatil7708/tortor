import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMerchant } from '@/lib/tenant'
import { handleError } from '@/lib/api-response'

// KPI cards + recent orders / status breakdown / needs attention / low stock.
// Consumed by the dashboard Overview page (camelCase shape).
export async function GET(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const { searchParams } = new URL(req.url)
    const days = Number(searchParams.get('days') || '30')

    const since = new Date()
    since.setDate(since.getDate() - days)

    const [totalOrders, paidOrders, pendingOrders, toPack, inTransit, delivered, openOrders, salesAgg, totalCustomers, activeProducts, recentOrders, actionOrders, statusGroups, lowStock, merchant] = await Promise.all([
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
      prisma.order.count({ where: { merchantId: session.id, orderStatus: { notIn: ['completed', 'cancelled'] } } }),
      prisma.order.aggregate({
        where: { merchantId: session.id, createdAt: { gte: since }, orderStatus: { not: 'cancelled' }, paymentStatus: 'paid' },
        _sum: { totalAmount: true },
      }),
      prisma.customer.count({ where: { merchantId: session.id, createdAt: { gte: since } } }),
      prisma.product.count({ where: { merchantId: session.id, status: 'active' } }),
      prisma.order.findMany({
        where: { merchantId: session.id },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          orderNumber: true,
          currency: true,
          totalAmount: true,
          paymentStatus: true,
          orderStatus: true,
          fulfillmentSummaryStatus: true,
          createdAt: true,
          source: true,
          customer: { select: { fullName: true } },
          orderItems: { select: { quantityOrdered: true } },
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
        select: {
          id: true,
          orderNumber: true,
          paymentStatus: true,
          orderStatus: true,
          fulfillmentSummaryStatus: true,
          customer: { select: { fullName: true } },
        },
      }),
      prisma.order.groupBy({
        by: ['orderStatus'],
        where: { merchantId: session.id, createdAt: { gte: since } },
        _count: { _all: true },
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
        select: { id: true, name: true, stockQuantity: true },
      }),
      prisma.merchant.findUnique({ where: { id: session.id } }),
    ])

    const totalRevenue = salesAgg._sum.totalAmount?.toNumber() ?? 0

    const statusBreakdown: Record<string, number> = {}
    for (const g of statusGroups) statusBreakdown[g.orderStatus] = g._count._all

    return NextResponse.json({
      merchant: {
        id: merchant?.id,
        businessName: merchant?.businessName ?? '',
        email: merchant?.email,
      },
      totals: {
        totalRevenue,
        totalOrders,
        totalCustomers,
        totalProducts: activeProducts,
        pendingPayments: pendingOrders,
        openOrders,
        unfulfilledOrders: toPack,
        shipmentsInTransit: inTransit,
        deliveredOrders: delivered,
        lowStockProducts: lowStock.length,
      },
      recentOrders: recentOrders.map(o => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customer: { fullName: o.customer?.fullName ?? null },
        totalAmount: o.totalAmount.toNumber(),
        currency: o.currency,
        paymentStatus: o.paymentStatus,
        orderStatus: o.orderStatus,
        fulfillmentSummaryStatus: o.fulfillmentSummaryStatus,
        createdAt: o.createdAt.toISOString(),
        source: o.source,
        itemCount: o.orderItems.reduce((s, i) => s + i.quantityOrdered, 0),
      })),
      statusBreakdown,
      needsAttention: actionOrders.map(o => ({
        id: o.id,
        orderNumber: o.orderNumber,
        paymentStatus: o.paymentStatus,
        orderStatus: o.orderStatus,
        fulfillmentSummaryStatus: o.fulfillmentSummaryStatus,
        customerName: o.customer?.fullName ?? 'Walk-in',
      })),
      lowStock: lowStock.map(p => ({ id: p.id, name: p.name, stockQuantity: p.stockQuantity })),
      recentActivities: [],
    })
  } catch (err) {
    return handleError(err)
  }
}