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

    const txns = await prisma.transaction.findMany({
      where: where as any,
      select: { createdAt: true, status: true },
      orderBy: { createdAt: 'asc' },
    })

    const byDay: Record<string, { total: number; success: number; failed: number; pending: number }> = {}
    txns.forEach(t => {
      const day = t.createdAt.toISOString().slice(0, 10)
      if (!byDay[day]) byDay[day] = { total: 0, success: 0, failed: 0, pending: 0 }
      byDay[day].total++
      if (t.status === 'success') byDay[day].success++
      else if (t.status === 'failed') byDay[day].failed++
      else byDay[day].pending++
    })

    const timeseries = Object.entries(byDay).map(([date, counts]) => ({ date, ...counts }))

    return NextResponse.json({ timeseries })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
