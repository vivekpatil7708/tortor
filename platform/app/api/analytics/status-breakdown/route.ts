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

    const where: Prisma.TransactionWhereInput = { merchantId: session.id }
    if (from || to) where.createdAt = createdAt

    const txns = await prisma.transaction.findMany({
      where,
      select: { status: true },
    })

    const breakdown: Record<string, number> = {}
    txns.forEach(t => {
      breakdown[t.status] = (breakdown[t.status] || 0) + 1
    })

    return NextResponse.json({ breakdown })
  } catch (err) {
    return handleError(err, 'Could not load analytics')
  }
}
