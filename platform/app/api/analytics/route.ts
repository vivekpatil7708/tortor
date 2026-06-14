import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await requireSession()
    const txns = await prisma.transaction.findMany({
      where: { merchantId: session.id },
      orderBy: { createdAt: 'desc' },
    })

    const successTxns = txns.filter(t => t.status === 'success')
    const totalRevenue = successTxns.reduce((a, t) => a + t.amount, 0)
    const avgOrder = successTxns.length > 0 ? totalRevenue / successTxns.length : 0
    const conversion = txns.length > 0 ? (successTxns.length / txns.length) * 100 : 0

    const byDay: Record<string, number> = {}
    successTxns.forEach(t => {
      const day = t.createdAt.toISOString().slice(0, 10)
      byDay[day] = (byDay[day] || 0) + t.amount
    })

    const byStatus = {
      success: txns.filter(t => t.status === 'success').length,
      pending: txns.filter(t => t.status === 'pending').length,
      initiated: txns.filter(t => t.status === 'initiated').length,
      failed: txns.filter(t => t.status === 'failed').length,
    }

    return NextResponse.json({
      total_revenue: totalRevenue,
      avg_order: avgOrder,
      conversion_rate: Math.round(conversion * 10) / 10,
      total_transactions: txns.length,
      by_day: byDay,
      by_status: byStatus,
      recent_success: successTxns.slice(0, 20).map(t => ({
        txn_id: t.txnId,
        amount: t.amount,
        created_at: t.createdAt.toISOString(),
      })),
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
