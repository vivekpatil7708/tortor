import { NextRequest, NextResponse } from 'next/server'
import { authorizeApiRequest, logApiRequest } from '@/lib/api-request'
import { apiError, publicErrorMessage } from '@/lib/api-response'
import { analyticsSummary } from '@/lib/analytics-summary'

/**
 * GET /api/v1/analytics — payment analytics summary (API key auth, read scope).
 * Optional from/to query params: plain dates (2026-10-06) mean whole days in
 * India; full timestamps are used as they are. Transactions have no test/live
 * split in the data model, so the mode header is checked by authorizeApiRequest
 * but does not filter these rows.
 */
export async function GET(req: NextRequest) {
  const authorized = await authorizeApiRequest(req, 'read')
  if (authorized instanceof NextResponse) return authorized
  const { auth } = authorized

  const route = '/api/v1/analytics'
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')

  try {
    const summary = await analyticsSummary(auth.merchantId, from, to)
    if (!summary) {
      await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route, statusCode: 400 })
      return apiError(400, 'Dates must look like 2026-10-06')
    }

    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route, statusCode: 200 })
    return NextResponse.json(summary)
  } catch (err) {
    const message = publicErrorMessage(err, 'Could not load the summary')
    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route, statusCode: 500 })
    return apiError(500, message)
  }
}
