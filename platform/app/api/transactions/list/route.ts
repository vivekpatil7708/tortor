import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireSession } from '@/lib/auth'
import { handleError } from '@/lib/api-response'
import { prisma } from '@/lib/prisma'
import { serializeTransaction } from '@/lib/serializers'
import { readTransactionQuery } from '@/lib/transaction-query'

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession()
    const params = req.nextUrl.searchParams

    const query = readTransactionQuery(params)
    if ('error' in query) return NextResponse.json({ error: query.error }, { status: 400 })

    const where: Prisma.TransactionWhereInput = { merchantId: session.id, ...query.filters }
    const rows = await prisma.transaction.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    })
    const hasMore = rows.length > query.limit
    const page = hasMore ? rows.slice(0, query.limit) : rows

    return NextResponse.json({
      transactions: page.map(serializeTransaction),
      next_cursor: hasMore ? page[page.length - 1].id : null,
      // Counted on the first page; later pages keep the number the browser already has.
      total: query.cursor ? null : await prisma.transaction.count({ where }),
    })
  } catch (err) {
    return handleError(err, 'Could not load transactions')
  }
}
