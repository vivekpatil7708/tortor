import { NextRequest, NextResponse } from 'next/server'
import { clearImpersonation, destroySession, getImpersonation, getSession } from '@/lib/auth'

/**
 * Where the dashboard sends a browser whose login has ended (signed out on
 * another device, password reset, account suspended or deleted). It clears only
 * a login that no longer works, so a link to this address can't sign anyone out.
 */
export async function GET(req: NextRequest) {
  if (await getSession()) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }
  // Admin "view as merchant" of an account that is no longer available: end only that view.
  if (await getImpersonation()) {
    await clearImpersonation()
    return NextResponse.redirect(new URL('/admin', req.url))
  }
  await destroySession()
  return NextResponse.redirect(new URL('/login?ended=1', req.url))
}
