import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireSession } from '@/lib/auth'
import { handleError } from '@/lib/api-response'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession()
    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const dateFilter: Record<string, Date> = {}
    if (from) dateFilter.gte = new Date(from)
    if (to) dateFilter.lte = new Date(to)

    const where: Prisma.TransactionWhereInput = { merchantId: session.id }
    if (from || to) where.createdAt = dateFilter

    // Counted and added up in the database, so every transaction is included
    // without loading them all.
    const groups = await prisma.transaction.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
      _sum: { amount: true },
    })
    const count = (...statuses: string[]) =>
      groups.filter(g => statuses.includes(g.status)).reduce((a, g) => a + g._count._all, 0)
    const sum = (status: string) =>
      groups.filter(g => g.status === status).reduce((a, g) => a + (g._sum.amount ?? 0), 0)

    const totalOrders = count(...groups.map(g => g.status))
    const successful = count('success')
    const totalRevenue = sum('success')
    const avgOrder = successful > 0 ? totalRevenue / successful : 0
    const conversion = totalOrders > 0 ? (successful / totalOrders) * 100 : 0

    return NextResponse.json({
      total_orders: totalOrders,
      successful_payments: successful,
      failed_payments: count('failed'),
      pending_orders: count('pending', 'initiated'),
      gross_payment_volume: totalRevenue,
      refund_amount: sum('refunded'),
      conversion_rate: Math.round(conversion * 10) / 10,
      average_order_value: Math.round(avgOrder * 100) / 100,
    })
  } catch (err) {
    return handleError(err, 'Could not load the summary')
  }
}
