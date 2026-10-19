import type { Prisma } from '@prisma/client'
import { istDayStart, istDayEnd } from '@/lib/ist-day'

// Shared list/search query rules for orders, used by the dashboard route
// (app/api/orders/list). Kept separate from the route so the parsing rules can
// be tested directly, the way transaction-query.ts is.

const PAYMENT_STATUSES = new Set([
  'pending', 'processing', 'paid', 'failed', 'expired', 'partially_refunded', 'refunded', 'disputed',
])
const ORDER_STATUSES = new Set(['pending_payment', 'new', 'processing', 'on_hold', 'completed', 'cancelled'])
const FULFILLMENT_STATUSES = new Set([
  'unfulfilled', 'partially_fulfilled', 'fulfilled', 'partially_delivered', 'delivered', 'attention_required', 'returned', 'cancelled',
])
const SOURCES = new Set(['manual_order', 'payment_link', 'website_api', 'instagram', 'whatsapp', 'imported', 'other'])

const MAX_LIMIT = 200
const DEFAULT_LIMIT = 50
const MAX_SEARCH = 64
const ID = /^[A-Za-z0-9-]{1,64}$/

/**
 * Matches the order number, the customer's name, phone or email, or the
 * merchant's own reference for the order.
 */
export function orderSearchWhere(q: string): Prisma.OrderWhereInput {
  return {
    OR: [
      { orderNumber: { contains: q, mode: 'insensitive' } },
      { merchantOrderReference: { contains: q, mode: 'insensitive' } },
      { customerNote: { contains: q, mode: 'insensitive' } },
      { customer: { is: { fullName: { contains: q, mode: 'insensitive' } } } },
      { customer: { is: { email: { contains: q, mode: 'insensitive' } } } },
      { customer: { is: { phone: { contains: q } } } },
    ],
  }
}

export type OrderListQuery = { limit: number; cursor?: string; filters: Prisma.OrderWhereInput }

/** The parsed list query, or the problem with it. */
export function readOrderQuery(params: URLSearchParams): OrderListQuery | { error: string } {
  const rawLimit = params.get('limit')
  const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return { error: `limit must be 1 to ${MAX_LIMIT}` }

  const cursor = params.get('cursor') || undefined
  if (cursor && !ID.test(cursor)) return { error: 'Invalid cursor' }

  const filters: Prisma.OrderWhereInput = {}

  const paymentStatus = params.get('payment_status')
  if (paymentStatus) {
    if (!PAYMENT_STATUSES.has(paymentStatus)) return { error: 'Unknown payment status' }
    filters.paymentStatus = paymentStatus as Prisma.OrderWhereInput['paymentStatus']
  }

  const orderStatus = params.get('order_status')
  if (orderStatus) {
    if (!ORDER_STATUSES.has(orderStatus)) return { error: 'Unknown order status' }
    filters.orderStatus = orderStatus as Prisma.OrderWhereInput['orderStatus']
  }

  const fulfillment = params.get('fulfillment_status')
  if (fulfillment) {
    if (!FULFILLMENT_STATUSES.has(fulfillment)) return { error: 'Unknown fulfillment status' }
    filters.fulfillmentSummaryStatus = fulfillment as Prisma.OrderWhereInput['fulfillmentSummaryStatus']
  }

  const source = params.get('source')
  if (source) {
    if (!SOURCES.has(source)) return { error: 'Unknown source' }
    filters.source = source as Prisma.OrderWhereInput['source']
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
    Object.assign(filters, orderSearchWhere(q))
  }

  return { limit, cursor, filters }
}
