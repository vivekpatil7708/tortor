import { NextRequest, NextResponse } from 'next/server'
import { authorizeApiRequest, logApiRequest } from '@/lib/api-request'
import { apiError, publicErrorMessage } from '@/lib/api-response'
import { createManualRefund, listManualRefunds } from '@/lib/refund-tracking'
import { createRefundSchema, refundListQuerySchema } from '@/lib/validators'
import { zodMessage } from '@/lib/zod-error'

const route = '/api/v1/refunds'
const MISSING_TABLE =
  'Refund tracking is not set up yet. Run platform/prisma/migrations/add_refunds.sql and try again.'

function isMissingTable(err: unknown) {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err.code === 'P2021' || err.code === 'P2022')
  )
}

function errorStatus(message: string): number {
  if (message === 'Unauthorized') return 401
  if (
    message === 'Choose an order or a transaction to refund' ||
    message === 'Order not found' ||
    message === 'Transaction not found' ||
    message === 'Only a paid order can be refunded' ||
    message === 'Only a payment received from the customer can be refunded' ||
    message === 'Refund amount must be at least 0.01' ||
    message === 'There is no paid amount to refund' ||
    message === 'Refund amount must be greater than zero' ||
    message.startsWith('Refund cannot exceed') ||
    message === 'This payment has already been fully refunded'
  ) {
    return 400
  }
  return 500
}

/** GET /api/v1/refunds - list recorded refunds (API key auth, read scope). */
export async function GET(req: NextRequest) {
  const authorized = await authorizeApiRequest(req, 'read')
  if (authorized instanceof NextResponse) return authorized
  const { auth } = authorized

  const parsed = refundListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) {
    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route, statusCode: 400 })
    return apiError(400, zodMessage(parsed.error) || 'Invalid request')
  }

  try {
    const result = await listManualRefunds(auth.merchantId, parsed.data)
    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route, statusCode: 200 })
    return NextResponse.json(result)
  } catch (err) {
    if (isMissingTable(err)) {
      await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route, statusCode: 503 })
      return apiError(503, MISSING_TABLE)
    }
    const message = publicErrorMessage(err, 'Could not load refunds')
    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route, statusCode: 500 })
    return apiError(500, message)
  }
}

/**
 * POST /api/v1/refunds - record a refund (API key auth, write scope). The
 * merchant sends the money separately; this records the amount and reference.
 */
export async function POST(req: NextRequest) {
  const authorized = await authorizeApiRequest(req, 'write')
  if (authorized instanceof NextResponse) return authorized
  const { auth } = authorized

  const requestBody = await req.json().catch(() => null)
  const parsed = createRefundSchema.safeParse(requestBody)
  if (!parsed.success) {
    await logApiRequest({
      merchantId: auth.merchantId,
      apiKeyId: auth.apiKeyId,
      method: 'POST',
      route,
      statusCode: 400,
      bodySummary: requestBody,
    })
    return apiError(400, zodMessage(parsed.error) || 'Invalid request body')
  }

  try {
    const refund = await createManualRefund({
      merchantId: auth.merchantId,
      orderId: parsed.data.order_id ?? null,
      transactionId: parsed.data.transaction_id ?? null,
      amount: parsed.data.amount,
      reason: parsed.data.reason ?? null,
      actorUserId: null,
    })

    await logApiRequest({
      merchantId: auth.merchantId,
      apiKeyId: auth.apiKeyId,
      method: 'POST',
      route,
      statusCode: 201,
      bodySummary: requestBody,
    })
    return NextResponse.json({ refund }, { status: 201 })
  } catch (err) {
    if (isMissingTable(err)) {
      await logApiRequest({
        merchantId: auth.merchantId,
        apiKeyId: auth.apiKeyId,
        method: 'POST',
        route,
        statusCode: 503,
        bodySummary: requestBody,
      })
      return apiError(503, MISSING_TABLE)
    }
    const message = publicErrorMessage(err, 'Could not record the refund')
    const status = errorStatus(message)
    await logApiRequest({
      merchantId: auth.merchantId,
      apiKeyId: auth.apiKeyId,
      method: 'POST',
      route,
      statusCode: status,
      bodySummary: requestBody,
    })
    return apiError(status, message)
  }
}
