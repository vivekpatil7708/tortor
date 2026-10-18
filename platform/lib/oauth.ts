import crypto from 'crypto'
import type { PrismaClient } from '@prisma/client'
import { prisma } from './prisma'
import { hashApiKey } from './api-key'

// OAuth 2.0 for public MCP connectors (Grok, Claude, …).
// Grant endpoints live in app/oauth/*; authorizeApiRequest (lib/api-request.ts)
// uses authenticateAccessToken to accept these tokens alongside API keys.
// Codes and tokens are stored as HMAC-SHA256 hashes — the raw values are only
// ever shown to the client once, like API keys (lib/api-key.ts).

/** OAuth access tokens start with tpo_, API keys with tp_test_/tp_live_. */
export const OAUTH_TOKEN_PREFIX = 'tpo_'
/** The operator-registered MCP connector client (see ensureDefaultOAuthClient). */
export const MCP_OAUTH_CLIENT_ID = 'toropay-mcp'

const AUTH_CODE_TTL_MS = 10 * 60 * 1000
const ACCESS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

const OAUTH_SCOPES = ['read', 'write'] as const
export type OAuthScope = (typeof OAUTH_SCOPES)[number]

/** Same constant-time comparison style as lib/api-key.ts. */
function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

/**
 * Parse a requested scope string ("read write", also '+' separated) into the
 * scopes this platform grants. Unknown scopes make the whole request invalid.
 */
export function parseScopes(raw: string): OAuthScope[] | null {
  const parts = raw.split(/[\s+]/).filter(Boolean)
  if (!parts.length) return null
  const scopes: OAuthScope[] = []
  for (const part of parts) {
    if (!(OAUTH_SCOPES as readonly string[]).includes(part)) return null
    if (!scopes.includes(part as OAuthScope)) scopes.push(part as OAuthScope)
  }
  return scopes
}

export interface OAuthClientRecord {
  id: string
  name: string
  clientId: string
  redirectUris: string[]
  scopes: string[]
}

/** Look up a client by its public client_id, with JSON fields parsed. */
export async function findOAuthClient(clientId: string): Promise<OAuthClientRecord | null> {
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } })
  if (!client) return null
  return {
    id: client.id,
    name: client.name,
    clientId: client.clientId,
    redirectUris: JSON.parse(client.redirectUris) as string[],
    scopes: JSON.parse(client.scopes) as string[],
  }
}

/**
 * Issue a single-use authorization code for an approved request. The raw code
 * is returned once; only its hash is stored. bound to the client, merchant,
 * redirect URI, scopes and PKCE challenge of the approval.
 */
export async function issueAuthorizationCode(input: {
  clientId: string
  merchantId: string
  redirectUri: string
  scopes: OAuthScope[]
  codeChallenge?: string | null
}): Promise<string> {
  const rawCode = `tpoc_${crypto.randomBytes(32).toString('hex')}`
  await prisma.oAuthAuthCode.create({
    data: {
      code: hashApiKey(rawCode),
      clientId: input.clientId,
      merchantId: input.merchantId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge || null,
      scopes: JSON.stringify(input.scopes),
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
    },
  })
  return rawCode
}

export type OAuthTokenResponse = { access_token: string; token_type: 'Bearer'; expires_in: number; scope: string }
export type OAuthTokenError = { error: string; error_description: string }

/** Authenticate a client (public client_id + secret) and return its database row id. */
export async function authenticateOAuthClient(clientId: string, clientSecret: string | null) {
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } })
  if (!client || !clientSecret || !safeEqual(hashApiKey(clientSecret), client.clientSecret)) return null
  return { id: client.id, name: client.name }
}

/**
 * Exchange an authorization code for an access token (grant_type=authorization_code).
 * Validates the client secret, the code (single-use, unexpired, same client and
 * redirect URI) and PKCE when the client sent a challenge at approval time.
 * Returns the RFC 6749 error to reply with, or the token response.
 */
export async function exchangeAuthCode(input: {
  code: string
  clientId: string
  clientSecret: string | null
  redirectUri?: string | null
  codeVerifier?: string | null
}): Promise<OAuthTokenResponse | OAuthTokenError> {
  const invalidGrant = (description: string): OAuthTokenError => ({ error: 'invalid_grant', error_description: description })

  const client = await authenticateOAuthClient(input.clientId, input.clientSecret)
  if (!client) return { error: 'invalid_client', error_description: 'Invalid client credentials.' }

  const row = await prisma.oAuthAuthCode.findUnique({ where: { code: hashApiKey(input.code) } })
  if (!row || row.clientId !== client.id) return invalidGrant('Unknown authorization code.')
  if (row.used) return invalidGrant('Authorization code already used.')
  if (row.expiresAt < new Date()) return invalidGrant('Authorization code expired.')
  // The code is bound to the redirect URI shown at approval (RFC 6749 §4.1.3).
  if (input.redirectUri !== row.redirectUri) return invalidGrant('redirect_uri does not match.')

  if (row.codeChallenge) {
    // Only S256 is accepted; the authorize endpoint rejects other methods up front.
    const verifier = input.codeVerifier
    if (!verifier) return invalidGrant('code_verifier is required.')
    const digest = crypto.createHash('sha256').update(verifier).digest('base64url')
    if (!safeEqual(digest, row.codeChallenge)) return invalidGrant('PKCE verification failed.')
  }

  // Claim the code (single-use even under concurrent exchanges) before minting the token.
  const claimed = await prisma.oAuthAuthCode.updateMany({
    where: { id: row.id, used: false },
    data: { used: true },
  })
  if (claimed.count !== 1) return invalidGrant('Authorization code already used.')

  const rawToken = `${OAUTH_TOKEN_PREFIX}${crypto.randomBytes(32).toString('hex')}`
  const expiresInSeconds = Math.floor(ACCESS_TOKEN_TTL_MS / 1000)
  await prisma.oAuthAccessToken.create({
    data: {
      token: hashApiKey(rawToken),
      clientId: row.clientId,
      merchantId: row.merchantId,
      scopes: row.scopes,
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
    },
  })
  return {
    access_token: rawToken,
    token_type: 'Bearer',
    expires_in: expiresInSeconds,
    scope: (JSON.parse(row.scopes) as string[]).join(' '),
  }
}

/** Authenticate a Bearer tpo_... access token, or null when unknown/revoked/expired. */
export async function authenticateAccessToken(rawToken: string) {
  if (!rawToken.startsWith(OAUTH_TOKEN_PREFIX)) return null
  const token = await prisma.oAuthAccessToken.findUnique({ where: { token: hashApiKey(rawToken) } })
  if (!token) return null
  if (token.revokedAt || token.expiresAt < new Date()) return null
  return { merchantId: token.merchantId, tokenId: token.id, scopes: JSON.parse(token.scopes) as string[] }
}

/**
 * Revoke an access token (RFC 7009). Only the client it was issued to may
 * revoke it; unknown tokens are not an error.
 */
export async function revokeAccessToken(rawToken: string, clientDbId: string) {
  const token = await prisma.oAuthAccessToken.findUnique({ where: { token: hashApiKey(rawToken) } })
  if (!token || token.clientId !== clientDbId || token.revokedAt) return false
  await prisma.oAuthAccessToken.update({ where: { id: token.id }, data: { revokedAt: new Date() } })
  return true
}

/** Just enough of a Prisma client for ensureDefaultOAuthClient (also accepts the seed's own client). */
type OAuthClientDb = Pick<PrismaClient, 'oAuthClient'>

/**
 * Register the MCP connector client (idempotent — run from the seed). The raw
 * client secret is returned only when the row is first created; there is no way
 * to read it back later (only its hash is stored) — rotate by deleting the row.
 */
export async function ensureDefaultOAuthClient(db: OAuthClientDb = prisma) {
  const clientId = MCP_OAUTH_CLIENT_ID
  const existing = await db.oAuthClient.findUnique({ where: { clientId } })
  if (existing) return { clientId, clientSecret: null }
  const clientSecret = `tpocs_${crypto.randomBytes(24).toString('hex')}`
  await db.oAuthClient.create({
    data: {
      name: 'ToroPay MCP',
      clientId,
      clientSecret: hashApiKey(clientSecret),
      redirectUris: JSON.stringify(['https://toropay-mcp.vercel.app/callback']),
      scopes: JSON.stringify(['read', 'write']),
    },
  })
  return { clientId, clientSecret }
}
