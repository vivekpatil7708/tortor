import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-pepper'

// The OAuth grant with the database and session replaced by fakes.
const db = vi.hoisted(() => ({
  oAuthClient: { findUnique: vi.fn(), create: vi.fn() },
  oAuthAuthCode: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  oAuthAccessToken: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  apiKey: { findMany: vi.fn(), update: vi.fn() },
  apiRequestLog: { create: vi.fn() },
}))
const getSession = vi.hoisted(() => vi.fn())
const requireMerchant = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/auth', () => ({ getSession }))
vi.mock('@/lib/tenant', () => ({ requireMerchant }))

import { hashApiKey } from '@/lib/api-key'
import { authorizeApiRequest } from '@/lib/api-request'
import { listConnectedApps, revokeConnectedApp } from '@/lib/oauth'
import { GET as authorizePage, POST as authorizeSubmit } from '@/app/oauth/authorize/route'
import { POST as tokenExchange } from '@/app/oauth/token/route'
import { POST as tokenRevoke } from '@/app/oauth/revoke/route'
import { GET as listTokens } from '@/app/api/oauth/tokens/route'
import { DELETE as revokeToken } from '@/app/api/oauth/tokens/[id]/route'

const REDIRECT_URI = 'https://toropay-mcp.vercel.app/callback'
const clientRow = {
  id: 'c1',
  name: 'ToroPay MCP',
  clientId: 'toropay-mcp',
  clientSecret: hashApiKey('secret-plain'),
  redirectUris: JSON.stringify([REDIRECT_URI]),
  scopes: JSON.stringify(['read', 'write']),
  createdAt: new Date(),
}
const merchantSession = { id: 'm1', email: 'merchant@example.com', businessName: 'Demo Store' }

function authorizeGet(query: string) {
  return new NextRequest(`http://localhost/oauth/authorize?${query}`)
}
function authorizePost(fields: Record<string, string>) {
  return new NextRequest('http://localhost/oauth/authorize', {
    method: 'POST',
    body: new URLSearchParams(fields),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  })
}
function tokenPost(fields: Record<string, string>, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/oauth/token', {
    method: 'POST',
    body: new URLSearchParams(fields),
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
  })
}
function basicAuth(id: string, secret: string) {
  return { authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}` }
}

beforeEach(() => {
  vi.clearAllMocks()
  getSession.mockResolvedValue(merchantSession)
  requireMerchant.mockResolvedValue(merchantSession)
  db.apiRequestLog.create.mockResolvedValue({})
  db.oAuthAuthCode.updateMany.mockResolvedValue({ count: 1 })
})

describe('GET /oauth/authorize', () => {
  it('shows the approval page for a valid request', async () => {
    db.oAuthClient.findUnique.mockResolvedValue(clientRow)

    const res = await authorizePage(authorizeGet(`client_id=toropay-mcp&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=read%20write&state=abc123`))

    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('ToroPay MCP wants to access your account')
    expect(html).toContain('See your transactions, payment links and analytics')
    expect(html).toContain('Create and confirm payments on your behalf')
    expect(html).toContain('merchant@example.com')
    expect(html).toContain('name="client_id" value="toropay-mcp"')
    expect(html).toContain('name="state" value="abc123"')
    expect(html).toContain(`name="redirect_uri" value="${REDIRECT_URI}"`)
  })

  it('rejects an unknown client without redirecting', async () => {
    db.oAuthClient.findUnique.mockResolvedValue(null)

    const res = await authorizePage(authorizeGet('client_id=nope&redirect_uri=https%3A%2F%2Fevil.example&response_type=code'))

    expect(res.status).toBe(400)
    expect(res.headers.get('location')).toBeNull()
    expect(await res.text()).toContain('Unknown OAuth client')
    expect(getSession).not.toHaveBeenCalled()
  })

  it('rejects a redirect URI that is not registered without redirecting', async () => {
    db.oAuthClient.findUnique.mockResolvedValue(clientRow)

    const res = await authorizePage(authorizeGet('client_id=toropay-mcp&redirect_uri=https%3A%2F%2Fevil.example&response_type=code'))

    expect(res.status).toBe(400)
    expect(res.headers.get('location')).toBeNull()
    expect(await res.text()).toContain('not registered')
  })

  it('sends a logged-out merchant to the login page with a return path', async () => {
    db.oAuthClient.findUnique.mockResolvedValue(clientRow)
    getSession.mockResolvedValue(null)

    const res = await authorizePage(authorizeGet(`client_id=toropay-mcp&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code`))

    expect(res.status).toBe(307)
    const location = res.headers.get('location') || ''
    expect(location).toContain('/login?next=')
    expect(decodeURIComponent(location)).toContain('/oauth/authorize?client_id=toropay-mcp')
  })

  it('redirects with invalid_scope for an unknown scope', async () => {
    db.oAuthClient.findUnique.mockResolvedValue(clientRow)

    const res = await authorizePage(authorizeGet(`client_id=toropay-mcp&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=admin`))

    expect(res.status).toBe(302)
    const location = res.headers.get('location') || ''
    expect(location.startsWith(REDIRECT_URI)).toBe(true)
    expect(location).toContain('error=invalid_scope')
  })

  it('redirects with unsupported_response_type when response_type is not code', async () => {
    db.oAuthClient.findUnique.mockResolvedValue(clientRow)

    const res = await authorizePage(authorizeGet(`client_id=toropay-mcp&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=token`))

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('error=unsupported_response_type')
  })
})

describe('POST /oauth/authorize', () => {
  const approval = {
    client_id: 'toropay-mcp',
    redirect_uri: REDIRECT_URI,
    scope: 'read write',
    state: 'abc123',
    decision: 'approve',
  }

  it('issues a single-use code bound to the request and redirects back', async () => {
    db.oAuthClient.findUnique.mockResolvedValue(clientRow)
    db.oAuthAuthCode.create.mockResolvedValue({})

    const res = await authorizeSubmit(authorizePost(approval))

    expect(res.status).toBe(303)
    const location = new URL(res.headers.get('location') || '')
    expect(location.origin + location.pathname).toBe(REDIRECT_URI)
    expect(location.searchParams.get('state')).toBe('abc123')
    const rawCode = location.searchParams.get('code') || ''
    expect(rawCode.startsWith('tpoc_')).toBe(true)

    const created = db.oAuthAuthCode.create.mock.calls[0][0].data
    expect(created.code).toBe(hashApiKey(rawCode)) // stored hashed, never raw
    expect(created.code).not.toBe(rawCode)
    expect(created.clientId).toBe('c1') // the client row id (foreign key)
    expect(created.merchantId).toBe('m1')
    expect(created.redirectUri).toBe(REDIRECT_URI)
    expect(JSON.parse(created.scopes)).toEqual(['read', 'write'])
    expect(created.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('redirects with access_denied when the merchant denies', async () => {
    db.oAuthClient.findUnique.mockResolvedValue(clientRow)

    const res = await authorizeSubmit(authorizePost({ ...approval, decision: 'deny' }))

    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('error=access_denied')
    expect(db.oAuthAuthCode.create).not.toHaveBeenCalled()
  })

  it('sends a logged-out merchant to login instead of issuing a code', async () => {
    db.oAuthClient.findUnique.mockResolvedValue(clientRow)
    getSession.mockResolvedValue(null)

    const res = await authorizeSubmit(authorizePost(approval))

    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('/login?next=')
    expect(db.oAuthAuthCode.create).not.toHaveBeenCalled()
  })

  it('rejects scopes the client was not granted', async () => {
    db.oAuthClient.findUnique.mockResolvedValue({ ...clientRow, scopes: JSON.stringify(['read']) })

    const res = await authorizeSubmit(authorizePost(approval))

    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('error=invalid_scope')
    expect(db.oAuthAuthCode.create).not.toHaveBeenCalled()
  })
})

describe('POST /oauth/token', () => {
  const codePlain = 'tpoc_codeplain123'
  const codeRow = {
    id: 'ac1',
    code: hashApiKey(codePlain),
    clientId: 'c1',
    merchantId: 'm1',
    redirectUri: REDIRECT_URI,
    codeChallenge: null,
    scopes: JSON.stringify(['read', 'write']),
    expiresAt: new Date(Date.now() + 60_000),
    used: false,
    createdAt: new Date(),
  }

  it('exchanges a code for an access token (HTTP Basic client auth)', async () => {
    db.oAuthClient.findUnique.mockResolvedValue(clientRow)
    db.oAuthAuthCode.findUnique.mockResolvedValue(codeRow)
    db.oAuthAccessToken.create.mockResolvedValue({})

    const res = await tokenExchange(
      tokenPost({ grant_type: 'authorization_code', code: codePlain, redirect_uri: REDIRECT_URI }, basicAuth('toropay-mcp', 'secret-plain'))
    )
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.access_token.startsWith('tpo_')).toBe(true)
    expect(json.token_type).toBe('Bearer')
    expect(json.expires_in).toBe(2592000)
    expect(json.scope).toBe('read write')

    // The code is claimed and the token stored hashed.
    expect(db.oAuthAuthCode.updateMany).toHaveBeenCalledWith({ where: { id: 'ac1', used: false }, data: { used: true } })
    const created = db.oAuthAccessToken.create.mock.calls[0][0].data
    expect(created.token).toBe(hashApiKey(json.access_token))
    expect(created.merchantId).toBe('m1')
  })

  it('accepts client credentials in the body as well', async () => {
    db.oAuthClient.findUnique.mockResolvedValue(clientRow)
    db.oAuthAuthCode.findUnique.mockResolvedValue(codeRow)
    db.oAuthAccessToken.create.mockResolvedValue({})

    const res = await tokenExchange(
      tokenPost({ grant_type: 'authorization_code', code: codePlain, redirect_uri: REDIRECT_URI, client_id: 'toropay-mcp', client_secret: 'secret-plain' })
    )

    expect(res.status).toBe(200)
  })

  it('rejects a wrong client secret with 401 invalid_client', async () => {
    db.oAuthClient.findUnique.mockResolvedValue(clientRow)

    const res = await tokenExchange(
      tokenPost({ grant_type: 'authorization_code', code: codePlain, client_id: 'toropay-mcp', client_secret: 'nope' }, basicAuth('toropay-mcp', 'nope'))
    )
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.error).toBe('invalid_client')
    expect(db.oAuthAccessToken.create).not.toHaveBeenCalled()
  })

  it('rejects an unknown code with 400 invalid_grant', async () => {
    db.oAuthClient.findUnique.mockResolvedValue(clientRow)
    db.oAuthAuthCode.findUnique.mockResolvedValue(null)

    const res = await tokenExchange(tokenPost({ grant_type: 'authorization_code', code: 'tpoc_unknown', client_id: 'toropay-mcp', client_secret: 'secret-plain' }))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_grant')
  })

  it('rejects an already-used code', async () => {
    db.oAuthClient.findUnique.mockResolvedValue(clientRow)
    db.oAuthAuthCode.findUnique.mockResolvedValue({ ...codeRow, used: true })

    const res = await tokenExchange(tokenPost({ grant_type: 'authorization_code', code: codePlain, client_id: 'toropay-mcp', client_secret: 'secret-plain' }))

    expect(res.status).toBe(400)
    expect((await res.json()).error_description).toContain('already used')
  })

  it('rejects a redirect_uri that does not match the approval', async () => {
    db.oAuthClient.findUnique.mockResolvedValue(clientRow)
    db.oAuthAuthCode.findUnique.mockResolvedValue(codeRow)

    const res = await tokenExchange(
      tokenPost({ grant_type: 'authorization_code', code: codePlain, redirect_uri: 'https://evil.example/callback', client_id: 'toropay-mcp', client_secret: 'secret-plain' })
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error_description).toContain('redirect_uri')
  })

  it('verifies PKCE with the S256 challenge from the approval', async () => {
    // RFC 7636 appendix B test vector.
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    db.oAuthClient.findUnique.mockResolvedValue(clientRow)
    db.oAuthAuthCode.findUnique.mockResolvedValue({ ...codeRow, codeChallenge: challenge })
    db.oAuthAccessToken.create.mockResolvedValue({})

    const ok = await tokenExchange(
      tokenPost({ grant_type: 'authorization_code', code: codePlain, redirect_uri: REDIRECT_URI, client_id: 'toropay-mcp', client_secret: 'secret-plain', code_verifier: verifier })
    )
    expect(ok.status).toBe(200)

    const bad = await tokenExchange(
      tokenPost({ grant_type: 'authorization_code', code: codePlain, redirect_uri: REDIRECT_URI, client_id: 'toropay-mcp', client_secret: 'secret-plain', code_verifier: 'wrong-verifier' })
    )
    expect(bad.status).toBe(400)
    expect((await bad.json()).error_description).toContain('PKCE')

    const missing = await tokenExchange(
      tokenPost({ grant_type: 'authorization_code', code: codePlain, redirect_uri: REDIRECT_URI, client_id: 'toropay-mcp', client_secret: 'secret-plain' })
    )
    expect(missing.status).toBe(400)
  })

  it('rejects another grant type', async () => {
    const res = await tokenExchange(tokenPost({ grant_type: 'client_credentials', client_id: 'toropay-mcp', client_secret: 'secret-plain' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('unsupported_grant_type')
  })

  it('rejects a code lost to a concurrent exchange', async () => {
    db.oAuthClient.findUnique.mockResolvedValue(clientRow)
    db.oAuthAuthCode.findUnique.mockResolvedValue(codeRow)
    db.oAuthAuthCode.updateMany.mockResolvedValue({ count: 0 })

    const res = await tokenExchange(tokenPost({ grant_type: 'authorization_code', code: codePlain, client_id: 'toropay-mcp', client_secret: 'secret-plain' }))

    expect(res.status).toBe(400)
    expect(db.oAuthAccessToken.create).not.toHaveBeenCalled()
  })
})

describe('POST /oauth/revoke', () => {
  it('revokes a token issued to the client', async () => {
    db.oAuthClient.findUnique.mockResolvedValue(clientRow)
    db.oAuthAccessToken.findUnique.mockResolvedValue({ id: 'o1', clientId: 'c1', revokedAt: null })
    db.oAuthAccessToken.update.mockResolvedValue({})

    const res = await tokenRevoke(
      new NextRequest('http://localhost/oauth/revoke', {
        method: 'POST',
        body: new URLSearchParams({ token: 'tpo_some_token' }),
        headers: { 'content-type': 'application/x-www-form-urlencoded', ...basicAuth('toropay-mcp', 'secret-plain') },
      })
    )

    expect(res.status).toBe(200)
    expect(db.oAuthAccessToken.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'o1' } }))
  })

  it('does not let one client revoke another client token', async () => {
    db.oAuthClient.findUnique.mockResolvedValue(clientRow)
    db.oAuthAccessToken.findUnique.mockResolvedValue({ id: 'o1', clientId: 'other', revokedAt: null })

    const res = await tokenRevoke(
      new NextRequest('http://localhost/oauth/revoke', {
        method: 'POST',
        body: new URLSearchParams({ token: 'tpo_some_token' }),
        headers: { 'content-type': 'application/x-www-form-urlencoded', ...basicAuth('toropay-mcp', 'secret-plain') },
      })
    )

    expect(res.status).toBe(200) // RFC 7009: still 200, nothing revoked
    expect(db.oAuthAccessToken.update).not.toHaveBeenCalled()
  })

  it('rejects a request without valid client credentials', async () => {
    db.oAuthClient.findUnique.mockResolvedValue(clientRow)

    const res = await tokenRevoke(
      new NextRequest('http://localhost/oauth/revoke', {
        method: 'POST',
        body: new URLSearchParams({ token: 'tpo_x', client_id: 'toropay-mcp', client_secret: 'nope' }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      })
    )

    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('invalid_client')
  })
})

describe('authorizeApiRequest with OAuth tokens', () => {
  const tokenPlain = 'tpo_abcdef123456'
  const tokenRow = {
    id: 'o1',
    token: hashApiKey(tokenPlain),
    clientId: 'c1',
    merchantId: 'm1',
    scopes: JSON.stringify(['read']),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    createdAt: new Date(),
  }
  const apiReq = (authorization: string) => new NextRequest('http://localhost/api/v1/transactions', { headers: { authorization } })

  it('accepts a valid token for the scopes it grants', async () => {
    db.oAuthAccessToken.findUnique.mockResolvedValue(tokenRow)

    const authorized = await authorizeApiRequest(apiReq(`Bearer ${tokenPlain}`), 'read')

    expect(authorized).not.toBeInstanceOf(NextResponse)
    if (authorized instanceof NextResponse) return
    expect(authorized.auth.merchantId).toBe('m1')
    expect(authorized.auth.apiKeyId).toBeNull() // nothing to link in api_keys
    expect(authorized.auth.source).toBe('oauth')
    expect(authorized.mode).toBe('test')
  })

  it('rejects a revoked or expired token with 401', async () => {
    db.oAuthAccessToken.findUnique.mockResolvedValue({ ...tokenRow, revokedAt: new Date() })

    const res = await authorizeApiRequest(apiReq(`Bearer ${tokenPlain}`), 'read')
    expect(res).toBeInstanceOf(NextResponse)
    if (!(res instanceof NextResponse)) return
    expect(res.status).toBe(401)
    expect((await res.json()).error).toContain('access token')
  })

  it('rejects a read-only token asking for write access with 403', async () => {
    db.oAuthAccessToken.findUnique.mockResolvedValue(tokenRow)

    const res = await authorizeApiRequest(apiReq(`Bearer ${tokenPlain}`), 'write')
    expect(res).toBeInstanceOf(NextResponse)
    if (!(res instanceof NextResponse)) return
    expect(res.status).toBe(403)
  })

  it('still authenticates API keys exactly as before', async () => {
    const rawKey = `tp_test_${'a'.repeat(48)}`
    db.apiKey.findMany.mockResolvedValue([{
      id: 'k1', merchantId: 'm1', keyHash: hashApiKey(rawKey), keyPrefix: rawKey.slice(0, 21),
      mode: 'test', scopes: JSON.stringify(['read', 'write']), expiresAt: null, revokedAt: null,
    }])
    db.apiKey.update.mockResolvedValue({})

    const authorized = await authorizeApiRequest(apiReq(`Bearer ${rawKey}`), 'write')

    expect(authorized).not.toBeInstanceOf(NextResponse)
    if (authorized instanceof NextResponse) return
    expect(authorized.auth.merchantId).toBe('m1')
    expect(authorized.auth.apiKeyId).toBe('k1')
    expect(authorized.auth.source).toBe('api_key')
  })
})

describe('Settings → Connected apps', () => {
  const tokenRowForList = (overrides: Record<string, unknown> = {}) => ({
    id: 't1',
    clientId: 'c1',
    merchantId: 'm1',
    scopes: JSON.stringify(['read', 'write']),
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null as Date | null,
    createdAt: new Date('2026-01-05T10:00:00Z'),
    client: { name: 'ToroPay MCP' },
    ...overrides,
  })

  it('lists the merchant tokens with the app name and a derived status', async () => {
    db.oAuthAccessToken.findMany.mockResolvedValue([
      tokenRowForList(),
      tokenRowForList({ id: 't2', expiresAt: new Date(Date.now() - 60_000) }),
      tokenRowForList({ id: 't3', revokedAt: new Date() }),
    ])

    const apps = await listConnectedApps('m1')

    expect(db.oAuthAccessToken.findMany).toHaveBeenCalledWith({
      where: { merchantId: 'm1' },
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    expect(apps.map((app) => app.status)).toEqual(['active', 'expired', 'revoked'])
    expect(apps[0]).toMatchObject({ clientName: 'ToroPay MCP', scopes: ['read', 'write'], revokedAt: null })
    expect(apps[0].expiresAt).toBe(new Date(apps[0].expiresAt).toISOString())
  })

  it('serves the list to a signed-in merchant and 401s otherwise', async () => {
    db.oAuthAccessToken.findMany.mockResolvedValue([tokenRowForList()])

    const ok = await listTokens()
    expect(ok.status).toBe(200)
    expect(await ok.json()).toHaveLength(1)

    requireMerchant.mockRejectedValueOnce(new Error('Unauthorized'))
    expect((await listTokens()).status).toBe(401)
  })

  it('revokes an app, scoped to the merchant, and 404s someone else\'s token', async () => {
    db.oAuthAccessToken.updateMany.mockResolvedValue({ count: 1 })

    const res = await revokeToken(
      new NextRequest('http://localhost/api/oauth/tokens/t1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 't1' }) }
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(db.oAuthAccessToken.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', merchantId: 'm1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    })

    db.oAuthAccessToken.updateMany.mockResolvedValue({ count: 0 })
    db.oAuthAccessToken.findFirst.mockResolvedValue(null)
    const missing = await revokeToken(
      new NextRequest('http://localhost/api/oauth/tokens/nope', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'nope' }) }
    )
    expect(missing.status).toBe(404)
  })

  it('treats an already-revoked token as done (a second click is not an error)', async () => {
    db.oAuthAccessToken.updateMany.mockResolvedValue({ count: 0 })
    db.oAuthAccessToken.findFirst.mockResolvedValue({ id: 't1' })

    expect(await revokeConnectedApp('t1', 'm1')).toBe(true)
  })

  it('points the approval page at the Connected apps screen', async () => {
    db.oAuthClient.findUnique.mockResolvedValue(clientRow)

    const res = await authorizePage(authorizeGet(`client_id=toropay-mcp&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code`))

    expect(await res.text()).toContain('/dashboard/settings?tab=apps')
  })
})
