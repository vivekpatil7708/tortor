import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { authorizeApiRequest, logApiRequest } from '@/lib/api-request'
import { apiError, publicErrorMessage } from '@/lib/api-response'
import { prisma } from '@/lib/prisma'
import { serializeSubscription } from '@/lib/subscriptions'
import { zodMessage } from '@/lib/zod-error'

const route = '/api/v1/subscriptions'

const subscriptionQuerySchema = z.object({
  status: z.enum(['active', 'paused', 'cancelled']).optional(),
  customer_id: z.string().trim().min(1).max(64).optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
})

/**
 * GET /api/v1/subscriptions - list recurring plans (API key auth, read scope).
 * Includes the customer and the last five billing attempts for each plan.
 * Subscriptions have no test/live split in the data model, so the mode header
 * is validated but does not filter these rows.
 */
export async function GET(req: NextRequest) {
  const authorized = await authorizeApiRequest(req, 'read')
  if (authorized instanceof NextResponse) return authorized
  const { auth } = authorized

  const parsed = subscriptionQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) {
    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route, statusCode: 400 })
    return apiError(400, zodMessage(parsed.error) || 'Invalid request')
  }

  const { status, customer_id, q, limit } = parsed.data
  const where: Prisma.SubscriptionWhereInput = {
    merchantId: auth.merchantId,
    ...(status ? { status } : {}),
    ...(customer_id ? { customerId: customer_id } : {}),
    ...(q
      ? {
          OR: [
            { planName: { contains: q, mode: 'insensitive' } },
            { customer: { fullName: { contains: q, mode: 'insensitive' } } },
            { customer: { phone: { contains: q, mode: 'insensitive' } } },
            { customer: { email: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }

  try {
    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          customer: { select: { id: true, fullName: true, phone: true, email: true } },
          payments: {
            orderBy: { billingDate: 'desc' },
            take: 5,
            include: {
              paymentLink: { select: { slug: true, title: true } },
              transaction: { select: { txnId: true, status: true } },
            },
          },
        },
      }),
      prisma.subscription.count({ where }),
    ])

    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route, statusCode: 200 })
    return NextResponse.json({
      subscriptions: subscriptions.map(serializeSubscription),
      total,
    })
  } catch (err) {
    const message = publicErrorMessage(err, 'Could not load subscriptions')
    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route, statusCode: 500 })
    return apiError(500, message)
  }
}
