import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireSession } from '@/lib/auth'
import { handleError } from '@/lib/api-response'
import { istDayEnd, istDayStart } from '@/lib/ist-day'
import { prisma } from '@/lib/prisma'
import { serializeTransaction } from '@/lib/serializers'

const STATUSES = new Set(['initiated', 'pending', 'success', 'failed'])
const MAX_LIMIT = 500
const DEFAULT_LIMIT = 50
const MAX_SEARCH = 64
const ID = /^[A-Za-z0-9-]{1,64}$/

/** Name, phone or reference (ToroPay's TXN code or the UPI reference/UTR) containing the search text. */
function searchWhere(q: string): Prisma.TransactionWhereInput {
  const or: Prisma.TransactionWhereInput[] = [
    { customerName: { contains: q, mode: 'insensitive' } },
    { customerPhone: { contains: q } },
    { txnId: { contains: q, mode: 'insensitive' } },
    { upiTxnId: { contains: q, mode: 'insensitive' } },
    { upiPaymentRef: { contains: q, mode: 'insensitive' } },
  ]
  // "98765 43210" also finds a phone saved as "9876543210".
  const digits = q.replace(/[\s-]/g, '')
  if (digits !== q && /^\+?\d+$/.test(digits)) or.push({ customerPhone: { contains: digits } })
  return { OR: or }
}

type Query = { limit: number; cursor?: string; filters: Prisma.TransactionWhereInput }

function readQuery(params: URLSearchParams): Query | { error: string } {
  const rawLimit = params.get('limit')
  const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return { error: `limit must be 1 to ${MAX_LIMIT}` }

  const cursor = params.get('cursor') || undefined
  if (cursor && !ID.test(cursor)) return { error: 'Invalid cursor' }

  const filters: Prisma.TransactionWhereInput = {}
  const status = params.get('status')
  if (status) {
    if (!STATUSES.has(status)) return { error: 'Unknown status' }
    filters.status = status
  }
  const link = params.get('link')
  if (link) {
    if (!ID.test(link)) return { error: 'Invalid link' }
    filters.paymentLinkId = link
  }
  // "From 6 Oct to 6 Oct" means the whole of 6 October in India.
  const from = params.get('from')
  const to = params.get('to')
  if (from || to) {
    const gte = from ? istDayStart(from) : undefined
    const lt = to ? istDayEnd(to) : undefined
    if (gte === null || lt === null) return { error: 'Dates must look like 2026-10-06' }
    filters.createdAt = { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) }
  }
  const q = (params.get('q') || '').trim()
  if (q) {
    if (q.length > MAX_SEARCH) return { error: `Search must be ${MAX_SEARCH} characters or fewer` }
    Object.assign(filters, searchWhere(q))
  }
  return { limit, cursor, filters }
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession()
    const params = req.nextUrl.searchParams

    const query = readQuery(params)
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
