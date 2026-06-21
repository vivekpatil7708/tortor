import { NextResponse, type NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const COOKIE_NAME = 'toropay_session'

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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
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
  matcher: ['/dashboard/:path*', '/admin/:path*', '/onboarding', '/login', '/signup'],
}
