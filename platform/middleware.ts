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

async function hasValidSession(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return false
  try {
    const secret = process.env.JWT_SECRET
    if (!secret) return false
    await jwtVerify(token, new TextEncoder().encode(secret))
    return true
  } catch {
    return false
  }
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

  const loggedIn = await hasValidSession(req)

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
