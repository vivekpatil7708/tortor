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
      select: { status: true },
    })

    const breakdown: Record<string, number> = {}
    txns.forEach(t => {
      breakdown[t.status] = (breakdown[t.status] || 0) + 1
    })

    return NextResponse.json({ breakdown })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
