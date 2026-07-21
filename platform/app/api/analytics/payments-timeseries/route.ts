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

    const where: Record<string, unknown> = { merchantId: session.id, status: 'success' }
    if (from || to) where.createdAt = dateFilter

    const txns = await prisma.transaction.findMany({
      where: where as any,
      select: { amount: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })

    const byDay: Record<string, number> = {}
    txns.forEach(t => {
      const day = t.createdAt.toISOString().slice(0, 10)
      byDay[day] = (byDay[day] || 0) + t.amount
    })

    const timeseries = Object.entries(byDay).map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }))

    return NextResponse.json({ timeseries })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
