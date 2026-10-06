import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireSession } from '@/lib/auth'
import { handleError } from '@/lib/api-response'
import { createdAtRange } from '@/lib/ist-day'
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

    const where: Prisma.TransactionWhereInput = { merchantId: session.id, status: 'success' }
    if (from || to) where.createdAt = createdAt

    const txns = await prisma.transaction.findMany({
      where,
      select: { amount: true, paymentApp: true, paymentLinkId: true },
    })

    const byApp: Record<string, { count: number; amount: number }> = {}
    txns.forEach(t => {
      const app = t.paymentApp || 'Unknown'
      if (!byApp[app]) byApp[app] = { count: 0, amount: 0 }
      byApp[app].count++
      byApp[app].amount += t.amount
    })

    const topPaymentApps = Object.entries(byApp)
      .map(([name, data]) => ({ name, count: data.count, amount: Math.round(data.amount * 100) / 100 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    let topLinks: { name: string; count: number; amount: number }[] = []
    if (txns.some(t => t.paymentLinkId)) {
      const linkIds = Array.from(new Set(txns.filter(t => t.paymentLinkId).map(t => t.paymentLinkId!)))
      const links = await prisma.paymentLink.findMany({
        where: { id: { in: linkIds } },
        select: { id: true, title: true },
      })
      const linkMap = new Map(links.map(l => [l.id, l.title]))

      const byLink: Record<string, { count: number; amount: number }> = {}
      txns.filter(t => t.paymentLinkId).forEach(t => {
        const id = t.paymentLinkId!
        if (!byLink[id]) byLink[id] = { count: 0, amount: 0 }
        byLink[id].count++
        byLink[id].amount += t.amount
      })

      topLinks = Object.entries(byLink)
        .map(([id, data]) => ({ name: linkMap.get(id) || 'Deleted Link', count: data.count, amount: Math.round(data.amount * 100) / 100 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    }

    return NextResponse.json({ top_payment_apps: topPaymentApps, top_links: topLinks })
  } catch (err) {
    return handleError(err, 'Could not load analytics')
  }
}
