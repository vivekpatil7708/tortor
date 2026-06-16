import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    await requireAdmin()

    const merchants = await prisma.merchant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { transactions: true } },
        transactions: { where: { status: 'success' }, select: { amount: true } },
      },
    })

    return NextResponse.json({
      merchants: merchants.map(m => ({
        id: m.id,
        email: m.email,
        phone: m.phone,
        business_name: m.businessName,
        status: m.status,
        onboarding_complete: m.onboardingComplete,
        created_at: m.createdAt.toISOString(),
        transaction_count: m._count.transactions,
        revenue: m.transactions.reduce((a, t) => a + t.amount, 0),
      })),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error'
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500 })
  }
}
