import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { findOAuthClient, issueAuthorizationCode, parseScopes, type OAuthClientRecord, type OAuthScope } from '@/lib/oauth'

/**
 * GET /oauth/authorize — the merchant-facing approval page ("ToroPay MCP wants
 * to access your account") for the OAuth 2.0 grant behind public MCP connectors.
 * POST /oauth/authorize — the Approve/Deny form: issues a single-use
 * authorization code and redirects back to the client's redirect URI.
 * Client registration is operator-controlled (see ensureDefaultOAuthClient).
 */

const SCOPE_DESCRIPTIONS: Record<OAuthScope, string> = {
  read: 'See your transactions, payment links and analytics',
  write: 'Create and confirm payments on your behalf',
}

const MAX_STATE = 2048
const MAX_CHALLENGE = 256

function esc(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function htmlPage(body: string, status = 200) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ToroPay — Authorize access</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         font-family: Inter, system-ui, -apple-system, sans-serif; background: #f6f5f0; color: #2c2c2c; padding: 24px; }
  .card { width: 100%; max-width: 440px; background: #fff; border: 1px solid rgba(0,0,0,.08);
          border-radius: 16px; padding: 32px; box-shadow: 0 8px 30px rgba(0,0,0,.06); }
  .logo { font-size: 20px; font-weight: 700; color: #7bb86c; margin: 0 0 16px; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  p { font-size: 14px; line-height: 1.5; color: #555; margin: 0 0 12px; }
  ul { margin: 0 0 20px; padding-left: 18px; font-size: 14px; line-height: 1.6; color: #444; }
  .merchant { font-size: 13px; color: #888; margin-bottom: 20px; }
  .actions { display: flex; gap: 10px; }
  button { flex: 1; padding: 12px 16px; font-size: 15px; font-weight: 600; border-radius: 10px;
           border: 1px solid transparent; cursor: pointer; }
  .approve { background: #7bb86c; color: #fff; }
  .approve:hover { background: #6aa75c; }
  .deny { background: #fff; color: #555; border-color: #ddd; }
  .deny:hover { background: #f5f5f5; }
  .error { color: #b3413a; }
</style>
</head>
<body><div class="card">${body}</div></body>
</html>`
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

function errorPage(message: string, status = 400) {
  return htmlPage(`<p class="logo">ToroPay</p><h1>Authorization request</h1><p class="error">${esc(message)}</p>`, status)
}

/** Redirect back to the client with an OAuth error (only once the URI is known-good). */
function redirectWithError(redirectUri: string, error: string, description: string, state: string | null, status: number) {
  const url = new URL(redirectUri)
  url.searchParams.set('error', error)
  url.searchParams.set('error_description', description)
  if (state) url.searchParams.set('state', state)
  return NextResponse.redirect(url, status)
}

type AuthorizationRequest =
  /** Invalid request that must not redirect (bad client or redirect URI). */
  | { kind: 'page'; response: NextResponse }
  /** Error that may be sent back to the (verified) redirect URI. */
  | { kind: 'redirect'; error: string; description: string; redirectUri: string; state: string | null }
  | { kind: 'ok'; client: OAuthClientRecord; scopes: OAuthScope[]; redirectUri: string; state: string | null; codeChallenge: string | null }

/** Validate the request the same way for GET and POST (RFC 6749 §4.1.1). */
async function readAuthorizationRequest(params: URLSearchParams): Promise<AuthorizationRequest> {
  const clientId = params.get('client_id') || ''
  const redirectUri = params.get('redirect_uri') || ''
  const state = params.get('state')
  const codeChallenge = params.get('code_challenge') || null

  const client = clientId.length <= 128 ? await findOAuthClient(clientId) : null
  if (!client) return { kind: 'page', response: errorPage('Unknown OAuth client.') }
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return { kind: 'page', response: errorPage('The redirect URI is not registered for this client.') }
  }
  const redirectError = (error: string, description: string, echoState: string | null = state): AuthorizationRequest => ({
    kind: 'redirect',
    error,
    description,
    redirectUri,
    state: echoState,
  })
  if (state && state.length > MAX_STATE) {
    return redirectError('invalid_request', 'state is too long', null)
  }
  if (params.get('response_type') !== 'code') {
    return redirectError('unsupported_response_type', 'response_type must be code')
  }
  if (codeChallenge && codeChallenge.length > MAX_CHALLENGE) {
    return redirectError('invalid_request', 'code_challenge is too long')
  }
  const method = params.get('code_challenge_method')
  if (codeChallenge && method && method !== 'S256') {
    return redirectError('invalid_request', 'code_challenge_method must be S256')
  }

  // No scope parameter means every scope the client may request.
  const requested = parseScopes(params.get('scope') === null ? client.scopes.join(' ') : params.get('scope') || '')
  if (!requested || !requested.every((s) => client.scopes.includes(s))) {
    return redirectError('invalid_scope', 'Unknown or ungranted scope')
  }
  return { kind: 'ok', client, scopes: requested, redirectUri, state, codeChallenge: codeChallenge || null }
}

export async function GET(req: NextRequest) {
  const validated = await readAuthorizationRequest(req.nextUrl.searchParams)
  if (validated.kind === 'page') return validated.response
  if (validated.kind === 'redirect') {
    return redirectWithError(validated.redirectUri, validated.error, validated.description, validated.state, 302)
  }

  const session = await getSession()
  if (!session) {
    const next = req.nextUrl.pathname + req.nextUrl.search
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, req.url))
  }

  const { client, scopes, state, codeChallenge } = validated
  const scopeItems = scopes
    .map((s) => `<li><strong>${esc(s)}</strong> — ${esc(SCOPE_DESCRIPTIONS[s])}</li>`)
    .join('')
  const merchantLabel = session.businessName ? `${session.businessName} (${session.email})` : session.email
  const stateField = state ? `<input type="hidden" name="state" value="${esc(state)}">` : ''
  const challengeField = codeChallenge ? `<input type="hidden" name="code_challenge" value="${esc(codeChallenge)}">` : ''

  return htmlPage(`
    <p class="logo">ToroPay</p>
    <h1>${esc(client.name)} wants to access your account</h1>
    <p>Signed in as <strong>${esc(merchantLabel)}</strong>. This will allow ${esc(client.name)} to:</p>
    <ul>${scopeItems}</ul>
    <p class="merchant">You can revoke this access at any time from Settings → Connected apps.</p>
    <form method="post" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="${esc(client.clientId)}">
      <input type="hidden" name="redirect_uri" value="${esc(validated.redirectUri)}">
      <input type="hidden" name="scope" value="${esc(scopes.join(' '))}">
      ${stateField}
      ${challengeField}
      <div class="actions">
        <button type="submit" name="decision" value="deny" class="deny">Deny</button>
        <button type="submit" name="decision" value="approve" class="approve">Approve access</button>
      </div>
    </form>`)
}

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const params = new URLSearchParams()
  for (const [key, value] of form) params.set(key, String(value))
  params.set('response_type', 'code') // the form only ever represents an approval of a code request

  const validated = await readAuthorizationRequest(params)
  if (validated.kind === 'page') return validated.response
  if (validated.kind === 'redirect') {
    return redirectWithError(validated.redirectUri, validated.error, validated.description, validated.state, 303)
  }

  const session = await getSession()
  if (!session) {
    const next = `/oauth/authorize?${params.toString()}`
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, req.url), 303)
  }

  const dest = new URL(validated.redirectUri)
  if (validated.state) dest.searchParams.set('state', validated.state)
  if (params.get('decision') !== 'approve') {
    dest.searchParams.set('error', 'access_denied')
    return NextResponse.redirect(dest, 303)
  }

  const rawCode = await issueAuthorizationCode({
    clientId: validated.client.id,
    merchantId: session.id,
    redirectUri: validated.redirectUri,
    scopes: validated.scopes,
    codeChallenge: validated.codeChallenge,
  })
  dest.searchParams.set('code', rawCode)
  return NextResponse.redirect(dest, 303)
}
