import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { authorizeApiRequest, logApiRequest } from '@/lib/api-request'
import { apiError, handleError } from '@/lib/api-response'
import { serializeTransaction } from '@/lib/serializers'
import { readTransactionQuery } from '@/lib/transaction-query'

/**
 * GET /api/v1/transactions — list a merchant's payment-link transactions (API key auth).
 * Same filters and paging as the dashboard list (status, link, from, to, q, limit, cursor).
 * Transactions have no test/live split in the data model, so the mode header is
 * checked by authorizeApiRequest but does not filter these rows.
 */
export async function GET(req: NextRequest) {
  const authorized = await authorizeApiRequest(req, 'read')
  if (authorized instanceof NextResponse) return authorized
  const { auth } = authorized

  const route = '/api/v1/transactions'
  const query = readTransactionQuery(req.nextUrl.searchParams)
  if ('error' in query) {
    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route, statusCode: 400 })
    return apiError(400, query.error)
  }

  try {
    const where: Prisma.TransactionWhereInput = { merchantId: auth.merchantId, ...query.filters }
    const rows = await prisma.transaction.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    })
    const hasMore = rows.length > query.limit
    const page = hasMore ? rows.slice(0, query.limit) : rows

    const responseBody = {
      transactions: page.map(serializeTransaction),
      next_cursor: hasMore ? page[page.length - 1].id : null,
      // Counted on the first page; later pages keep the number the client already has.
      total: query.cursor ? null : await prisma.transaction.count({ where }),
    }

    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route, statusCode: 200 })
    return NextResponse.json(responseBody)
  } catch (err) {
    const message = handleError(err, 'Could not load transactions')
    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route, statusCode: message.status })
    return message
  }
}
