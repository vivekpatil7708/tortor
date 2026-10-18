import { NextRequest, NextResponse } from 'next/server'
import { authorizeApiRequest, logApiRequest } from '@/lib/api-request'
import { apiError, publicErrorMessage } from '@/lib/api-response'
import { createPaymentLink, type CreateLinkInput } from '@/lib/payment-link-create'
import { listLinksWithTotals } from '@/lib/link-list'
import { serializeLink } from '@/lib/serializers'

/**
 * GET /api/v1/links — list a merchant's payment links with paid totals (API key auth, read scope).
 * Links have no test/live split in the data model, so the mode header is
 * checked by authorizeApiRequest but does not filter these rows.
 */
export async function GET(req: NextRequest) {
  const authorized = await authorizeApiRequest(req, 'read')
  if (authorized instanceof NextResponse) return authorized
  const { auth } = authorized

  const route = '/api/v1/links'
  try {
    const links = await listLinksWithTotals(auth.merchantId)
    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route, statusCode: 200 })
    return NextResponse.json(links)
  } catch (err) {
    const message = publicErrorMessage(err, 'Could not load your links')
    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route, statusCode: 500 })
    return apiError(500, message)
  }
}

/**
 * POST /api/v1/links — create a payment link (API key auth, write scope).
 * Reuses createPaymentLink, so the UPI ID must be one saved on the merchant
 * account and every amount/limit/URL rule is the same as the dashboard's.
 */
export async function POST(req: NextRequest) {
  const authorized = await authorizeApiRequest(req, 'write')
  if (authorized instanceof NextResponse) return authorized
  const { auth } = authorized

  const route = '/api/v1/links'
  const requestBody = await req.json().catch(() => null)
  if (!requestBody || typeof requestBody !== 'object') {
    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'POST', route, statusCode: 400 })
    return apiError(400, 'Request body must be a JSON object')
  }

  try {
    const result = await createPaymentLink(auth.merchantId, requestBody as CreateLinkInput)
    if (!result.ok) {
      await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'POST', route, statusCode: 400, bodySummary: requestBody })
      return apiError(400, result.error)
    }

    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'POST', route, statusCode: 201, bodySummary: requestBody })
    return NextResponse.json({ success: true, link: serializeLink(result.link) }, { status: 201 })
  } catch (err) {
    const message = publicErrorMessage(err, 'Failed to create link')
    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'POST', route, statusCode: 500, bodySummary: requestBody })
    return apiError(500, message)
  }
}
