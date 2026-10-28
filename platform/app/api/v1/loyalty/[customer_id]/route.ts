import { NextRequest, NextResponse } from 'next/server'
import { authorizeApiRequest, logApiRequest } from '@/lib/api-request'
import { apiError, publicErrorMessage } from '@/lib/api-response'
import { serializeLoyaltyEntry } from '@/lib/loyalty'
import { prisma } from '@/lib/prisma'

const route = '/api/v1/loyalty'

/**
 * GET /api/v1/loyalty/{customer_id} - a customer's points balance and recent
 * ledger (API key auth, read scope). Loyalty has no test/live split in the data
 * model, so the mode header is validated but does not filter these rows.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ customer_id: string }> }) {
  const authorized = await authorizeApiRequest(req, 'read')
  if (authorized instanceof NextResponse) return authorized
  const { auth } = authorized

  const { customer_id: customerId } = await props.params
  if (!customerId || customerId.length > 100) {
    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route, statusCode: 400 })
    return apiError(400, 'Choose a valid customer')
  }

  try {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, merchantId: auth.merchantId },
      select: { id: true, fullName: true, phone: true, email: true },
    })
    if (!customer) {
      await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route, statusCode: 404 })
      return apiError(404, 'Customer not found')
    }

    const [total, awarded, deducted, entries] = await Promise.all([
      prisma.loyaltyPoint.aggregate({
        where: { merchantId: auth.merchantId, customerId: customer.id },
        _sum: { points: true },
      }),
      prisma.loyaltyPoint.aggregate({
        where: { merchantId: auth.merchantId, customerId: customer.id, points: { gt: 0 } },
        _sum: { points: true },
      }),
      prisma.loyaltyPoint.aggregate({
        where: { merchantId: auth.merchantId, customerId: customer.id, points: { lt: 0 } },
        _sum: { points: true },
      }),
      prisma.loyaltyPoint.findMany({
        where: { merchantId: auth.merchantId, customerId: customer.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ])

    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route, statusCode: 200 })
    return NextResponse.json({
      customer: {
        id: customer.id,
        full_name: customer.fullName,
        phone: customer.phone,
        email: customer.email,
      },
      points_balance: total._sum.points ?? 0,
      points_awarded: awarded._sum.points ?? 0,
      points_deducted: Math.abs(deducted._sum.points ?? 0),
      entries: entries.map(entry => serializeLoyaltyEntry({ ...entry, customer })),
    })
  } catch (err) {
    const message = publicErrorMessage(err, 'Could not load loyalty points')
    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route, statusCode: 500 })
    return apiError(500, message)
  }
}
