import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMerchant } from '@/lib/tenant'
import { orderListQuerySchema } from '@/lib/validators'
import { handleError } from '@/lib/api-response'

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
    if (q.search) {
      const term = q.search
      where.OR = [
        { orderNumber: { contains: term, mode: 'insensitive' } },
        { customer: { fullName: { contains: term, mode: 'insensitive' } } },
        { customer: { phone: { contains: term, mode: 'insensitive' } } },
        { customer: { email: { contains: term, mode: 'insensitive' } } },
      ]
    }

    const orderBy =
      q.sort === 'oldest' ? { createdAt: 'asc' as const }
      : q.sort === 'amount' ? { totalAmount: 'desc' as const }
      : { createdAt: 'desc' as const }

    const orders = await prisma.order.findMany({
      where,
      orderBy,
      include: {
        customer: true,
        orderItems: true,
        fulfillments: { include: { packages: true } },
      },
    })

    const header = ['Order Number', 'Date', 'Customer', 'Phone', 'Email', 'Items', 'Subtotal', 'Discount', 'Shipping', 'Tax', 'Total', 'Currency', 'Payment Status', 'Order Status', 'Fulfillment Status', 'Source', 'Tracking Number', 'Courier']
    const escape = (v: string | number | null | undefined) => {
      if (v === null || v === undefined) return ''
      const s = String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows = orders.map(o => {
      const tracking = o.fulfillments.map(f => f.packages.map(p => p.trackingNumber).filter(Boolean).join(';')).filter(Boolean).join(';')
      const courier = o.fulfillments.map(f => f.packages.map(p => p.courierProvider).filter(Boolean).join(';')).filter(Boolean).join(';')
      return [
        o.orderNumber,
        o.createdAt.toISOString(),
        o.customer?.fullName ?? '',
        o.customer?.phone ?? '',
        o.customer?.email ?? '',
        o.orderItems.reduce((s, i) => s + i.quantityOrdered, 0),
        o.subtotalAmount.toNumber(),
        o.discountAmount.toNumber(),
        o.shippingAmount.toNumber(),
        o.taxAmount.toNumber(),
        o.totalAmount.toNumber(),
        o.currency,
        o.paymentStatus,
        o.orderStatus,
        o.fulfillmentSummaryStatus,
        o.source,
        tracking,
        courier,
      ].map(escape).join(',')
    })

    const csv = [header.join(','), ...rows].join('\n')

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  } catch (err) {
    return handleError(err)
  }
}