import { NextResponse, type NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { isCrossSiteRequest } from '@/lib/same-site'

const COOKIE_NAME = 'toropay_session'
const IMPERSONATE_COOKIE = 'toropay_impersonate'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
// Admin "view as merchant" is read-only: only leaving that view (or logging in/out) may change anything.
const IMPERSONATION_WRITES_ALLOWED = new Set([
  '/api/admin/impersonate/exit',
  '/api/auth/logout',
  '/api/auth/login',
  '/api/auth/google',
])

// A viewer is read-only. These prefixes cover merchant dashboard writes; public
// checkout/payment/webhook routes are deliberately absent so a signed-in viewer
// can still act as a customer.
const MERCHANT_WRITE_PREFIXES = [
  '/api/links',
  '/api/products',
  '/api/coupons',
  '/api/orders',
  '/api/customers',
  '/api/subscriptions',
  '/api/loyalty',
  '/api/settings',
  '/api/merchant',
  '/api/api-keys',
  '/api/webhook-endpoints',
  '/api/webhook-deliveries',
  '/api/oauth/tokens',
  '/api/upi',
  '/api/templates',
  '/api/messaging',
  '/api/email',
  '/api/courier',
  '/api/delivery',
  '/api/fulfillments',
  '/api/transactions',
  '/api/refunds',
  '/api/tax',
  '/api/team',
  '/api/invoices',
  '/api/payments',
  '/api/integrations',
  '/api/overview',
]
const VIEWER_WRITES_ALLOWED = new Set([
  // Accepting an invitation changes the member's own access, not merchant data.
  '/api/team/accept',
  // Public page-view tracking still runs while a viewer is signed in.
  '/api/analytics/pageview',
])

function isMerchantWrite(pathname: string) {
  if (VIEWER_WRITES_ALLOWED.has(pathname)) return false
  // The customer cancellation page uses a capability token, not a merchant
  // session. A signed-in viewer must still be able to open their own link.
  if (pathname.startsWith('/api/subscriptions/cancel/')) return false
  return MERCHANT_WRITE_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

async function readSession(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  try {
    const secret = process.env.JWT_SECRET
    if (!secret) return null
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret))
    // Other tokens signed with the same secret are not login sessions.
    if (payload.typ || payload.purpose || typeof payload.sub !== 'string') return null
    return payload
  } catch {
    return null
  }
}

function isViewerSession(payload: Awaited<ReturnType<typeof readSession>>) {
  if (!payload) return false
  if (payload.role === 'viewer') return true
  // A merchant-switching token without a valid role is treated as read-only,
  // matching getSession(). This cannot be minted by the current code, but it
  // keeps an old or damaged token from getting write access.
  const switching = typeof payload.mid === 'string' && payload.mid !== payload.sub
  return switching && payload.role !== 'admin' && payload.role !== 'owner'
}

const CORS_ALLOWED = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/api/')) {
    if (req.cookies.has(IMPERSONATE_COOKIE) && !SAFE_METHODS.has(req.method) && !IMPERSONATION_WRITES_ALLOWED.has(pathname)) {
      return NextResponse.json(
        { error: 'Admin merchant view is read-only. Exit merchant view to make changes.' },
        { status: 403 }
      )
    }
    // Sign-in actions only accept requests from ToroPay's own pages, so another
    // site can't log a visitor into someone else's account.
    if (pathname.startsWith('/api/auth/') && !SAFE_METHODS.has(req.method) && isCrossSiteRequest(req.headers, req.headers.get('host'))) {
      return NextResponse.json({ error: 'Request blocked' }, { status: 403 })
    }
    if (!SAFE_METHODS.has(req.method) && isMerchantWrite(pathname)) {
      if (isViewerSession(await readSession(req))) {
        return NextResponse.json(
          { error: 'You have view-only access to this account. Ask the owner for admin access to make changes.' },
          { status: 403 }
        )
      }
    }
    if (!pathname.startsWith('/api/v1')) return NextResponse.next()
  }

  if (pathname.startsWith('/api/v1')) {
    const origin = req.headers.get('origin') ?? ''
    const allowOrigin = CORS_ALLOWED.includes(origin) ? origin : ''
    if (allowOrigin) {
      if (req.method === 'OPTIONS') {
        return new NextResponse(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': allowOrigin,
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-toropay-mode',
            'Access-Control-Max-Age': '86400',
            'Vary': 'Origin',
          },
        })
      }
      const res = NextResponse.next()
      res.headers.set('Access-Control-Allow-Origin', allowOrigin)
      res.headers.set('Vary', 'Origin')
      return res
    }
    return NextResponse.next()
  }

  const isAuthPath = pathname.startsWith('/login') || pathname.startsWith('/signup')
  const isDashboardPath = pathname.startsWith('/dashboard')
  const isOnboardingPath = pathname.startsWith('/onboarding')
  const isAdminPath = pathname.startsWith('/admin')

  const loggedIn = Boolean(await readSession(req))

  if ((isDashboardPath || isAdminPath) && !loggedIn) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (isOnboardingPath && !loggedIn) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (isAuthPath && loggedIn) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/admin-verify', '/onboarding', '/login', '/signup', '/api/:path*'],
}
