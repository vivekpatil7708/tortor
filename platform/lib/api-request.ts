import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateApiKey, type ApiKeyAuth } from '@/lib/api-key'
import { apiError } from '@/lib/api-response'

export interface ApiRequestAuth {
  auth: ApiKeyAuth
  mode: 'test' | 'live'
}

/**
 * Authorize a v1 API request:
 *  - requires `Authorization: Bearer tp_...` (valid, not revoked, not expired)
 *  - enforces the key's scope (read/write)
 *  - `x-toropay-mode` (defaults to the key's mode) selects test/live workspace
 * Returns a NextResponse error, or the auth context on success.
 */
export async function authorizeApiRequest(
  req: NextRequest,
  requiredScope: 'read' | 'write'
): Promise<ApiRequestAuth | NextResponse> {
  const auth = await authenticateApiKey(req.headers.get('authorization'))
  if (!auth) return apiError(401, 'Invalid or missing API key')

  if (!auth.scopes.includes(requiredScope)) {
    return apiError(403, `This API key does not allow ${requiredScope} access`)
  }

  const requestedModeRaw = req.headers.get('x-toropay-mode') ?? 'test'
  const requestedMode = requestedModeRaw === 'live' ? 'live' : 'test'
  if (auth.mode !== 'test' && auth.mode !== requestedMode) {
    return apiError(400, 'x-toropay-mode does not match the API key mode')
  }
  // Test keys can only ever act on the test workspace.
  const mode = auth.mode === 'live' ? 'live' : 'test'

  return { auth, mode }
}

/**
 * Log an API request to api_request_logs. Best-effort; never throws.
 * Captures the request id (or generates one) plus the response status.
 */
export async function logApiRequest(params: {
  merchantId: string
  apiKeyId: string
  method: string
  route: string
  statusCode: number
  requestId?: string | null
  durationMs?: number
  bodySummary?: unknown
  ip?: string | null
}) {
  await prisma.apiRequestLog
    .create({
      data: {
        merchantId: params.merchantId,
        apiKeyId: params.apiKeyId,
        route: params.route.slice(0, 200),
        method: params.method,
        requestId: params.requestId ?? generateRequestId(),
        responseStatus: params.statusCode,
        durationMs: params.durationMs ?? 0,
        ipAddress: params.ip ? params.ip.slice(0, 45) : null,
      },
    })
    .catch(() => {})
}

function generateRequestId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}