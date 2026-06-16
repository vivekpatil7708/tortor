import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    await requireAdmin()

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const [totalMerchants, totalTransactions, revenueResult, signupsToday, revenueToday, activeMerchants, recentSignups] = await Promise.all([
      prisma.merchant.count(),
      prisma.transaction.count(),
      prisma.transaction.aggregate({ where: { status: 'success' }, _sum: { amount: true } }),
      prisma.merchant.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.transaction.aggregate({ where: { status: 'success', createdAt: { gte: todayStart } }, _sum: { amount: true } }),
      prisma.merchant.count({ where: { transactions: { some: {} } } }),
      prisma.merchant.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: { email: true, businessName: true, createdAt: true } }),
    ])

    return NextResponse.json({
      total_merchants: totalMerchants,
      total_transactions: totalTransactions,
      total_revenue: revenueResult._sum.amount || 0,
      signups_today: signupsToday,
      revenue_today: revenueToday._sum.amount || 0,
      active_merchants: activeMerchants,
      recent_signups: recentSignups.map(s => ({ email: s.email, business_name: s.businessName, created_at: s.createdAt.toISOString() })),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error'
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500 })
  }
}
