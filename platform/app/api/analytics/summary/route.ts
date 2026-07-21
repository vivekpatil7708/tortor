import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
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

    const where: Record<string, unknown> = { merchantId: session.id }
    if (from || to) where.createdAt = dateFilter

    const txns = await prisma.transaction.findMany({ where: where as any, select: { status: true, amount: true, createdAt: true } })

    const successTxns = txns.filter(t => t.status === 'success')
    const failedTxns = txns.filter(t => t.status === 'failed')
    const pendingTxns = txns.filter(t => t.status === 'pending' || t.status === 'initiated')
    const totalRevenue = successTxns.reduce((a, t) => a + t.amount, 0)
    const refundedTxns = txns.filter(t => t.status === 'refunded')
    const refundAmount = refundedTxns.reduce((a, t) => a + t.amount, 0)
    const avgOrder = successTxns.length > 0 ? totalRevenue / successTxns.length : 0
    const conversion = txns.length > 0 ? (successTxns.length / txns.length) * 100 : 0

    return NextResponse.json({
      total_orders: txns.length,
      successful_payments: successTxns.length,
      failed_payments: failedTxns.length,
      pending_orders: pendingTxns.length,
      gross_payment_volume: totalRevenue,
      refund_amount: refundAmount,
      conversion_rate: Math.round(conversion * 10) / 10,
      average_order_value: Math.round(avgOrder * 100) / 100,
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
