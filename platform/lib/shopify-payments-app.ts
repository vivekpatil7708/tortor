import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { createCheckout, TOROPAY_PUBLIC_URL } from '@/lib/checkout'
import { settlePaymentFromExternal } from '@/lib/payments/webhook-processor'
import { SHOPIFY_INSTALL_PATH } from '@/lib/shopify'

export const SHOPIFY_API_VERSION_DEFAULT = '2026-07'
export const SHOPIFY_SCOPES = 'read_payment_sessions,write_payment_sessions'

export interface ShopifyAppConfig {
  apiKey: string
  apiSecret: string
  appOrigin: string
  apiVersion: string
}

export function getShopifyAppConfig(): ShopifyAppConfig {
  const apiKey = process.env.SHOPIFY_API_KEY || ''
  const apiSecret = process.env.SHOPIFY_API_SECRET || ''
  if (!apiKey || !apiSecret) {
    throw new Error('SHOPIFY_API_KEY / SHOPIFY_API_SECRET are not set')
  }
  return {
    apiKey,
    apiSecret,
    appOrigin: process.env.SHOPIFY_APP_ORIGIN || TOROPAY_PUBLIC_URL,
    apiVersion: process.env.SHOPIFY_API_VERSION || SHOPIFY_API_VERSION_DEFAULT,
  }
}

export function isShopifyAppConfigured(): boolean {
  return Boolean(process.env.SHOPIFY_API_KEY && process.env.SHOPIFY_API_SECRET)
}

export function normalizeShopifyStore(storeDomain: string): string {
  return storeDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
}

const SHOPIFY_DOMAIN_RE = /^[a-zA-Z0-9-]+\.myshopify\.com$/

export function isValidShopifyStore(storeDomain: string): boolean {
  return SHOPIFY_DOMAIN_RE.test(storeDomain.trim().toLowerCase())
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value)
  return 0
}

export function buildShopifyAuthorizeUrl(shop: string, state: string): string {
  const { apiKey, appOrigin } = getShopifyAppConfig()
  const params = new URLSearchParams({
    client_id: apiKey,
    scope: SHOPIFY_SCOPES,
    redirect_uri: `${appOrigin}${SHOPIFY_INSTALL_PATH}/callback`,
    state,
  })
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`
}

export async function exchangeShopifyAuthCode(shop: string, code: string): Promise<string> {
  const { apiKey, apiSecret } = getShopifyAppConfig()
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: apiKey, client_secret: apiSecret, code }),
  })
  if (!res.ok) throw new Error(`Shopify token exchange failed (${res.status})`)
  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) throw new Error('Shopify token exchange returned no access token')
  return data.access_token
}

export function verifyShopifyOAuthCallback(search: URLSearchParams, secret: string): boolean {
  const signature = search.get('signature')
  if (!signature) return false
  const pairs: Array<[string, string]> = []
  search.forEach((value, key) => {
    if (key !== 'signature') pairs.push([key, value])
  })
  pairs.sort((a, b) => a[0].localeCompare(b[0]))
  const message = pairs.map(([key, value]) => `${key}=${value}`).join('&')
  const hmac = crypto.createHmac('sha256', secret).update(message).digest('hex')
  const a = Buffer.from(hmac, 'hex')
  const b = Buffer.from(signature, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function verifyShopifyAppRequest(
  headers: Headers,
  rawBody: string
): { ok: boolean; domain?: string } {
  try {
    const { apiKey, apiSecret } = getShopifyAppConfig()
    const domain = headers.get('x-shopify-shop-domain')
    const presentedKey = headers.get('x-shopify-api-key')
    const signature = headers.get('x-shopify-hmac-sha256')
    if (!domain || !signature || presentedKey !== apiKey) return { ok: false }
    const expected = crypto.createHmac('sha256', apiSecret).update(rawBody).digest('base64')
    const a = Buffer.from(expected, 'base64')
    const b = Buffer.from(signature, 'base64')
    return a.length === b.length && crypto.timingSafeEqual(a, b)
      ? { ok: true, domain }
      : { ok: false }
  } catch {
    return { ok: false }
  }
}

export interface ShopifyGraphQLResult {
  data?: Record<string, unknown>
  errors?: Array<{ message?: string }>
}

export async function shopifyPaymentsAppGraphQL(params: {
  shop: string
  accessToken: string
  query: string
  variables?: Record<string, unknown>
}): Promise<ShopifyGraphQLResult> {
  const { apiVersion } = getShopifyAppConfig()
  const res = await fetch(`https://${params.shop}/payments_apps/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': params.accessToken,
    },
    body: JSON.stringify({ query: params.query, variables: params.variables }),
  })
  const body = (await res.json()) as ShopifyGraphQLResult
  if (!res.ok) {
    throw new Error(body.errors?.[0]?.message || `Payments Apps API failed (${res.status})`)
  }
  return body
}

const RESOLVE_PAYMENT = `
mutation ResolvePayment($id: ID!) {
  paymentSessionResolve(id: $id) {
    paymentSession {
      id
      nextAction {
        type
        context {
          ... on PaymentSessionActionsRedirect {
            redirectUrl
          }
        }
      }
    }
    userErrors { field message code }
  }
}
`

const REJECT_PAYMENT = `
mutation RejectPayment($id: ID!, $reason: PaymentSessionStateRejectedReason!) {
  paymentSessionReject(id: $id, reason: $reason) {
    paymentSession { id }
    userErrors { field message code }
  }
}
`

const PEND_PAYMENT = `
mutation PendPayment($id: ID!, $pendingExpiresAt: DateTime!, $reason: PaymentSessionStatePendingReason!) {
  paymentSessionPending(id: $id, pendingExpiresAt: $pendingExpiresAt, reason: $reason) {
    paymentSession { id }
    userErrors { field message code }
  }
}
`

export type ShopifySessionResolution =
  | { ok: true; redirectUrl?: string | null }
  | { ok: false; error: string }

function redirectUrlFromResult(result: Record<string, unknown> | null | undefined): string | null {
  const paymentSession = result?.paymentSession as
    | { nextAction?: { type?: string; context?: { redirectUrl?: string | null } } }
    | null
    | undefined
  const nextAction = paymentSession?.nextAction
  return nextAction?.context?.redirectUrl ?? null
}

export async function resolveShopifyPaymentSession(
  conn: { storeDomain: string; accessToken: string },
  gid: string
): Promise<ShopifySessionResolution> {
  const result = await shopifyPaymentsAppGraphQL({
    shop: conn.storeDomain,
    accessToken: conn.accessToken,
    query: RESOLVE_PAYMENT,
    variables: { id: gid },
  })
  const payload = result.data?.paymentSessionResolve as
    | { userErrors?: Array<{ message?: string }>; paymentSession?: Record<string, unknown> }
    | null
    | undefined
  const userErrors = payload?.userErrors ?? []
  if (userErrors.length) return { ok: false, error: userErrors[0]?.message || 'Resolve failed' }
  return { ok: true, redirectUrl: redirectUrlFromResult(payload?.paymentSession) }
}

export async function rejectShopifyPaymentSession(
  conn: { storeDomain: string; accessToken: string },
  gid: string,
  reason: string
): Promise<ShopifySessionResolution> {
  const result = await shopifyPaymentsAppGraphQL({
    shop: conn.storeDomain,
    accessToken: conn.accessToken,
    query: REJECT_PAYMENT,
    variables: { id: gid, reason },
  })
  const payload = result.data?.paymentSessionReject as
    | { userErrors?: Array<{ message?: string }>; paymentSession?: Record<string, unknown> }
    | null
    | undefined
  const userErrors = payload?.userErrors ?? []
  if (userErrors.length) return { ok: false, error: userErrors[0]?.message || 'Reject failed' }
  return { ok: true, redirectUrl: redirectUrlFromResult(payload?.paymentSession) }
}

export async function pendShopifyPaymentSession(
  conn: { storeDomain: string; accessToken: string },
  gid: string,
  pendingExpiresAt: string
): Promise<ShopifySessionResolution> {
  const result = await shopifyPaymentsAppGraphQL({
    shop: conn.storeDomain,
    accessToken: conn.accessToken,
    query: PEND_PAYMENT,
    variables: { id: gid, pendingExpiresAt, reason: 'PARTNER_ACTION_REQUIRED' },
  })
  const payload = result.data?.paymentSessionPending as
    | { userErrors?: Array<{ message?: string }>; paymentSession?: Record<string, unknown> }
    | null
    | undefined
  const userErrors = payload?.userErrors ?? []
  if (userErrors.length) return { ok: false, error: userErrors[0]?.message || 'Pending failed' }
  return { ok: true, redirectUrl: redirectUrlFromResult(payload?.paymentSession) }
}

export interface ShopifyPaymentSessionPayload {
  id?: string
  gid?: string
  session_id?: string
  group?: string
  amount?: string | number
  currency?: string
  test?: boolean
  kind?: string
  cancel_url?: string
  customer?: {
    email?: string | null
    phone_number?: string | null
  } | null
}

export interface ShopifySessionCheckout {
  checkout_session_id: string
  checkout_url: string
  payment_id: string
}

export async function createCheckoutFromShopifyPaymentSession(
  conn: { merchantId: string; storeDomain: string },
  payload: ShopifyPaymentSessionPayload
): Promise<ShopifySessionCheckout> {
  const sessionId = String(payload.id ?? '')
  if (!sessionId) throw new Error('Shopify payment session missing id')
  const amount = toNumber(payload.amount)
  if (amount <= 0) throw new Error('Shopify payment session missing amount')

  const customer = payload.customer
    ? { email: payload.customer.email ?? null, phone: payload.customer.phone_number ?? null }
    : null

  const result = await createCheckout({
    merchantId: conn.merchantId,
    mode: payload.test ? 'test' : 'live',
    merchantOrderReference: `shopify_ps:${sessionId}`,
    idempotencyKey: `shopify_pay_session:${sessionId}`,
    customer,
    items: [{ productName: 'Shopify order', quantity: 1, unitPrice: amount }],
    currency: payload.currency || 'INR',
    expectedTotal: amount,
    orderSource: 'website_api',
    metadata: {
      gateway: 'shopify',
      shopify_payment_session_id: sessionId,
      shopify_payment_session_gid: payload.gid ?? null,
      shopify_group: payload.group ?? null,
      shopify_cancel_url: payload.cancel_url ?? null,
      store_domain: conn.storeDomain,
    },
  })

  const payment = await prisma.payment.findUnique({ where: { checkoutSessionId: result.checkout_session_id } })
  if (!payment) throw new Error('Checkout created without a payment')
  return { checkout_session_id: result.checkout_session_id, checkout_url: result.checkout_url, payment_id: payment.id }
}

export function shopifyMeta(payment: { providerResponse: unknown }): Record<string, unknown> {
  const meta = payment.providerResponse
  return meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : {}
}

export async function settleAndReturnToShopify(opts: {
  merchantId: string
  paymentId: string
  conn: { storeDomain: string; accessToken: string }
}): Promise<{ ok: boolean; redirectUrl?: string | null; error?: string }> {
  const settled = await settlePaymentFromExternal({
    paymentId: opts.paymentId,
    merchantId: opts.merchantId,
    source: 'shopify_gateway',
  })
  if (!settled.ok) return { ok: false, error: settled.error || 'Failed to settle payment' }

  const payment = await prisma.payment.findUnique({ where: { id: opts.paymentId } })
  const gid = shopifyMeta(payment ?? { providerResponse: null })['shopify_payment_session_gid']
  if (!gid || typeof gid !== 'string') return { ok: true, redirectUrl: null }

  const resolved = await resolveShopifyPaymentSession(opts.conn, gid)
  if (!resolved.ok) return resolved
  return { ok: true, redirectUrl: resolved.redirectUrl }
}