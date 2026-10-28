import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { ADMIN_SECOND_FACTOR_COOKIE, getSession } from './auth'

const SECOND_FACTOR_HOURS = 12

function getSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not set')
  return new TextEncoder().encode(secret)
}

export function isAdminEmail(email: string): boolean {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  return Boolean(adminEmail) && email.trim().toLowerCase() === adminEmail
}

/** True when this browser passed the authenticator-code check for this account. */
export async function hasAdminSecondFactor(merchantId: string): Promise<boolean> {
  const token = (await cookies()).get(ADMIN_SECOND_FACTOR_COOKIE)?.value
  if (!token) return false
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload.purpose === 'admin_2fa' && payload.sub === merchantId
  } catch {
    return false
  }
}

export async function grantAdminSecondFactor(merchantId: string) {
  const token = await new SignJWT({ purpose: 'admin_2fa' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(merchantId)
    .setIssuedAt()
    .setExpirationTime(`${SECOND_FACTOR_HOURS}h`)
    .sign(getSecret())

  const cookieStore = await cookies()
  cookieStore.set(ADMIN_SECOND_FACTOR_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SECOND_FACTOR_HOURS * 60 * 60,
  })
}

/**
 * Admin = the ADMIN_EMAIL account, with a verified email (so nobody can claim
 * it by signing up first), that also passed the authenticator-code check.
 */
export async function requireAdmin() {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  // Use the logged-in account, not the merchant currently being viewed. An
  // admin can be inside "view as merchant" mode, where session.email is the
  // merchant's email and session.id is the merchant's id.
  if (
    !isAdminEmail(session.accountEmail) ||
    !session.accountEmailVerifiedAt ||
    !(await hasAdminSecondFactor(session.accountId))
  ) {
    throw new Error('Forbidden')
  }
  return session
}
