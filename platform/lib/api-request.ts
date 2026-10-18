import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateApiKey } from '@/lib/api-key'
import { authenticateAccessToken, OAUTH_TOKEN_PREFIX } from '@/lib/oauth'
import { apiError } from '@/lib/api-response'

/** Who is calling: an API key (tp_test_/tp_live_...) or an OAuth access token (tpo_...). */
export interface AuthorizedCaller {
  merchantId: string
  /** The API key's row id; null for OAuth tokens (they are not API keys). */
  apiKeyId: string | null
  mode: 'test' | 'live'
  scopes: string[]
  source: 'api_key' | 'oauth'
}

export interface ApiRequestAuth {
  auth: AuthorizedCaller
  mode: 'test' | 'live'
}

/**
 * Authorize a v1 API request:
 *  - requires `Authorization: Bearer tp_...` (valid, not revoked, not expired)
 *    or a Bearer OAuth access token (tpo_... from POST /oauth/token)
 *  - enforces the credential's scope (read/write)
 *  - `x-toropay-mode` (defaults to the key's mode) selects test/live workspace
 * Returns a NextResponse error, or the auth context on success.
 */
export async function authorizeApiRequest(
  req: NextRequest,
  requiredScope: 'read' | 'write'
): Promise<ApiRequestAuth | NextResponse> {
  const authorization = req.headers.get('authorization')
  const bearer = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : ''

  // Both credential types arrive as Bearer tokens; the tpo_ prefix selects OAuth.
  if (bearer.startsWith(OAUTH_TOKEN_PREFIX)) {
    const token = await authenticateAccessToken(bearer)
    if (!token) return apiError(401, 'Invalid or expired access token')

    if (!token.scopes.includes(requiredScope)) {
      return apiError(403, `This access token does not allow ${requiredScope} access`)
    }
    // OAuth tokens are not bound to a mode; the header picks the workspace.
    const mode = req.headers.get('x-toropay-mode') === 'live' ? 'live' : 'test'
    return { auth: { merchantId: token.merchantId, apiKeyId: null, mode, scopes: token.scopes, source: 'oauth' }, mode }
  }

  const auth = await authenticateApiKey(authorization)
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

  return { auth: { ...auth, mode, source: 'api_key' }, mode }
}

/**
 * Log an API request to api_request_logs. Best-effort; never throws.
 * Captures the request id (or generates one) plus the response status.
 */
export async function logApiRequest(params: {
  merchantId: string
  /** API key row id; null for OAuth-token requests (nothing to link in api_keys). */
  apiKeyId?: string | null
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
        apiKeyId: params.apiKeyId ?? null,
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