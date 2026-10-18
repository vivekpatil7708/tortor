import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-response'
import { exchangeAuthCode } from '@/lib/oauth'

/**
 * POST /oauth/token — the OAuth 2.0 token endpoint (grant_type=authorization_code).
 * The client authenticates with its client_secret, either as HTTP Basic
 * credentials (RFC 6749 §2.3.1) or as client_id/client_secret body params.
 * Replies with the standard JSON access token response or an RFC 6749 error.
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
    // RFC 6749: Basic credentials are form-urlencoded before being encoded.
    const [id, secret] = decoded.split(':')
    clientId = decodeURIComponent(id || '')
    clientSecret = decodeURIComponent(secret || '')
  }

  const grantType = params.get('grant_type')
  if (grantType !== 'authorization_code') {
    return NextResponse.json({ error: 'unsupported_grant_type', error_description: 'Only authorization_code is supported.' }, { status: 400 })
  }
  if (!clientId || !params.get('code')) {
    return apiError(400, 'client_id and code are required')
  }

  const result = await exchangeAuthCode({
    code: params.get('code') || '',
    clientId,
    clientSecret,
    redirectUri: params.get('redirect_uri'),
    codeVerifier: params.get('code_verifier'),
  })
  if ('error' in result) {
    // invalid_client is the one OAuth error that gets its own status code.
    return NextResponse.json(result, { status: result.error === 'invalid_client' ? 401 : 400 })
  }
  return NextResponse.json(result)
}
