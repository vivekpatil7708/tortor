import { NextRequest, NextResponse } from 'next/server'
import { authenticateOAuthClient, revokeAccessToken } from '@/lib/oauth'

/**
 * POST /oauth/revoke — revokes an access token (RFC 7009). The client must
 * authenticate (HTTP Basic or client_id/client_secret in the body) and may only
 * revoke its own tokens. A valid client request always gets 200, even when the
 * token is unknown or already revoked.
 */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || ''
  let params: URLSearchParams
  if (contentType.includes('json')) {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    params = new URLSearchParams()
    for (const [key, value] of Object.entries(body || {})) params.set(key, String(value))
  } else {
    const form = await req.formData().catch(() => null)
    params = form ? new URLSearchParams([...form.entries()].map(([k, v]) => [k, String(v)])) : new URLSearchParams(await req.text().catch(() => ''))
  }

  let clientId = params.get('client_id')
  let clientSecret = params.get('client_secret')
  const authorization = req.headers.get('authorization')
  if (authorization?.startsWith('Basic ')) {
    const decoded = Buffer.from(authorization.slice('Basic '.length), 'base64').toString('utf8')
    const [id, secret] = decoded.split(':')
    clientId = decodeURIComponent(id || '')
    clientSecret = decodeURIComponent(secret || '')
  }

  const client = clientId ? await authenticateOAuthClient(clientId, clientSecret) : null
  if (!client) {
    return NextResponse.json({ error: 'invalid_client', error_description: 'Invalid client credentials.' }, { status: 401 })
  }

  const token = params.get('token')
  if (token) await revokeAccessToken(token, client.id)
  return NextResponse.json({}, { status: 200 })
}
