import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireSession } from '@/lib/auth'
import { handleError } from '@/lib/api-response'
import { createdAtRange } from '@/lib/ist-day'
import { CHECKOUT_HOLD_MINUTES } from '@/lib/link-uses'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession()
    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    // Plain dates mean whole days in India; full timestamps (the preset ranges) are used as they are.
    const createdAt = createdAtRange(from, to)
    if (!createdAt) return NextResponse.json({ error: 'Dates must look like 2026-10-06' }, { status: 400 })

    const where: Prisma.TransactionWhereInput = { merchantId: session.id }
    if (from || to) where.createdAt = createdAt

    // Counted and added up in the database, so every transaction is included
    // without loading them all.
    const holdStart = new Date(Date.now() - CHECKOUT_HOLD_MINUTES * 60_000)
    const [groups, abandoned] = await Promise.all([
      prisma.transaction.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      // Checkouts started over 30 minutes ago that the customer never marked as paid.
      prisma.transaction.count({ where: { AND: [where, { status: 'initiated', createdAt: { lt: holdStart } }] } }),
    ])
    const count = (...statuses: string[]) =>
      groups.filter(g => statuses.includes(g.status)).reduce((a, g) => a + g._count._all, 0)
    const sum = (status: string) =>
      groups.filter(g => g.status === status).reduce((a, g) => a + (g._sum.amount ?? 0), 0)

    const totalOrders = count(...groups.map(g => g.status))
    const successful = count('success')
    const totalRevenue = sum('success')
    const avgOrder = successful > 0 ? totalRevenue / successful : 0
    const conversion = totalOrders > 0 ? (successful / totalOrders) * 100 : 0
    // Success rate counts only payments that were settled either way, so a
    // customer who opened the link and left isn't counted as a failure.
    const settled = successful + count('failed')

    return NextResponse.json({
      total_orders: totalOrders,
      successful_payments: successful,
      failed_payments: count('failed'),
      pending_orders: count('pending', 'initiated'),
      gross_payment_volume: totalRevenue,
      refund_amount: sum('refunded'),
      conversion_rate: Math.round(conversion * 10) / 10,
      average_order_value: Math.round(avgOrder * 100) / 100,
      success_rate: settled > 0 ? Math.round((successful / settled) * 1000) / 10 : null,
      waiting_payments: count('pending'),
      abandoned_checkouts: abandoned,
      in_progress_checkouts: Math.max(0, count('initiated') - abandoned),
    })
  } catch (err) {
    return handleError(err, 'Could not load the summary')
  }
}
