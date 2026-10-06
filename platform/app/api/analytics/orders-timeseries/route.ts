import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireSession } from '@/lib/auth'
import { handleError } from '@/lib/api-response'
import { createdAtRange, istDayKey } from '@/lib/ist-day'
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

    const txns = await prisma.transaction.findMany({
      where,
      select: { createdAt: true, status: true },
      orderBy: { createdAt: 'asc' },
    })

    const byDay: Record<string, { total: number; success: number; failed: number; pending: number }> = {}
    txns.forEach(t => {
      const day = istDayKey(t.createdAt)
      if (!byDay[day]) byDay[day] = { total: 0, success: 0, failed: 0, pending: 0 }
      byDay[day].total++
      if (t.status === 'success') byDay[day].success++
      else if (t.status === 'failed') byDay[day].failed++
      else byDay[day].pending++
    })

    const timeseries = Object.entries(byDay).map(([date, counts]) => ({ date, ...counts }))

    return NextResponse.json({ timeseries })
  } catch (err) {
    return handleError(err, 'Could not load analytics')
  }
}
