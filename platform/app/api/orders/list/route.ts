import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { handleError } from '@/lib/api-response'
import { prisma } from '@/lib/prisma'
import { serializeOrder } from '@/lib/serializers'
import { readOrderQuery } from '@/lib/order-query'

/**
 * The merchant's orders, newest first, one page at a time.
 *
 * Test-mode orders are excluded: they exist to try a checkout flow and would
 * otherwise inflate a merchant's order list with things nobody bought.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession()
    const params = req.nextUrl.searchParams

    const query = readOrderQuery(params)
    if ('error' in query) return NextResponse.json({ error: query.error }, { status: 400 })

    const where = { merchantId: session.id, testMode: false, ...query.filters }
    const rows = await prisma.order.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        customer: true,
        orderItems: true,
      },
    })
    const hasMore = rows.length > query.limit
    const page = hasMore ? rows.slice(0, query.limit) : rows

    return NextResponse.json({
      orders: page.map(serializeOrder),
      next_cursor: hasMore ? page[page.length - 1].id : null,
      // Counted on the first page; later pages keep the number the browser already has.
      total: query.cursor ? null : await prisma.order.count({ where }),
    })
  } catch (err) {
    return handleError(err, 'Could not load orders')
  }
}
