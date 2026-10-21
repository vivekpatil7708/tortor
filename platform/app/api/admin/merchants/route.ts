import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-response'
import { adminErrorResponse } from '@/lib/admin-api'
import { adminPage, readAdminListQuery } from '@/lib/admin-query'

/** The states a merchant can be in. */
const MERCHANT_STATUSES = ['active', 'suspended', 'pending'] as const

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    const query = readAdminListQuery(req.nextUrl.searchParams, {
      statuses: MERCHANT_STATUSES,
      dateField: 'createdAt',
      search: (term) => ({
        OR: [
          { email: { contains: term, mode: 'insensitive' } },
          { businessName: { contains: term, mode: 'insensitive' } },
          { name: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term } },
        ],
      }),
    })
    if ('error' in query) return apiError(400, query.error)

    const rows = await prisma.merchant.findMany({
      where: query.filters,
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        email: true,
        phone: true,
        businessName: true,
        status: true,
        onboardingComplete: true,
        createdAt: true,
      },
    })

    const { page, nextCursor } = adminPage(rows, query.limit)
    const merchantIds = page.map(m => m.id)

    // The totals come from the database rather than from loading every
    // transaction of every merchant into memory.
    const [transactions, revenue, emails] = await Promise.all([
      prisma.transaction.groupBy({
        by: ['merchantId'],
        where: { merchantId: { in: merchantIds } },
        _count: { _all: true },
      }),
      prisma.transaction.groupBy({
        by: ['merchantId'],
        where: { merchantId: { in: merchantIds }, status: 'success' },
        _sum: { amount: true },
      }),
      prisma.messageLog.groupBy({
        by: ['merchantId'],
        where: { merchantId: { in: merchantIds }, channel: 'email' },
        _count: { _all: true },
      }),
    ])

    const transactionCount = new Map(transactions.map(t => [t.merchantId, t._count._all]))
    const revenueMap = new Map(revenue.map(r => [r.merchantId, r._sum.amount ?? 0]))
    const emailCountMap = new Map(emails.map(e => [e.merchantId, e._count._all]))

    return NextResponse.json({
      merchants: page.map(m => ({
        id: m.id,
        email: m.email,
        phone: m.phone,
        business_name: m.businessName,
        status: m.status,
        onboarding_complete: m.onboardingComplete,
        created_at: m.createdAt.toISOString(),
        transaction_count: transactionCount.get(m.id) ?? 0,
        revenue: revenueMap.get(m.id) ?? 0,
        emails_sent: emailCountMap.get(m.id) ?? 0,
      })),
      next_cursor: nextCursor,
    })
  } catch (err: unknown) {
    return adminErrorResponse(err)
  }
}
