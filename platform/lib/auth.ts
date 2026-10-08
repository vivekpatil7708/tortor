import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

const COOKIE_NAME = 'toropay_session'
const IMPERSONATE_COOKIE = 'toropay_impersonate'
/** Set once the admin passes the authenticator-code check (see lib/admin-auth.ts). */
export const ADMIN_SECOND_FACTOR_COOKIE = 'toropay_admin_2fa'

function getSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not set')
  return new TextEncoder().encode(secret)
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}

export async function createSession(merchantId: string, email: string) {
  // The login carries the account's session version; raising the version
  // (password reset, "sign out other devices") ends every older login.
  const account = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { sessionVersion: true } })
  const token = await new SignJWT({ sub: merchantId, email, sv: account?.sessionVersion ?? 0 })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret())

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
}

export async function destroySession() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
  cookieStore.delete(IMPERSONATE_COOKIE)
  cookieStore.delete(ADMIN_SECOND_FACTOR_COOKIE)
}

/** Ends every existing login for this account, on all devices. */
export async function endAllSessions(merchantId: string) {
  await prisma.merchant.update({ where: { id: merchantId }, data: { sessionVersion: { increment: 1 } } })
}

async function getImpersonationInfo(token: string) {
  const { payload } = await jwtVerify(token, getSecret())
  if (payload.typ !== 'impersonate') return null
  const merchantId = payload.sub as string | undefined
  const adminEmail = payload.admin_email as string | undefined
  if (!merchantId || !adminEmail) return null
  return { merchantId, adminEmail }
}

export async function getImpersonation() {
  const token = (await cookies()).get(IMPERSONATE_COOKIE)?.value
  if (!token) return null
  try {
    return await getImpersonationInfo(token)
  } catch {
    return null
  }
}

export async function createImpersonationSession(merchantId: string, adminEmail: string) {
  const token = await new SignJWT({ typ: 'impersonate', admin_email: adminEmail })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(merchantId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(getSecret())

  const cookieStore = await cookies()
  cookieStore.set(IMPERSONATE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60,
  })
}

export async function clearImpersonation() {
  const cookieStore = await cookies()
  cookieStore.delete(IMPERSONATE_COOKIE)
}

export async function getSession() {
  let merchantId: string | null = null
  // Session version in the login cookie; null for admin "view as merchant".
  let tokenVersion: number | null = null

  const impToken = (await cookies()).get(IMPERSONATE_COOKIE)?.value
  if (impToken) {
    try {
      const info = await getImpersonationInfo(impToken)
      if (info) merchantId = info.merchantId
    } catch {
      merchantId = null
    }
  }

  if (!merchantId) {
    const token = (await cookies()).get(COOKIE_NAME)?.value
    if (!token) return null
    try {
      const { payload } = await jwtVerify(token, getSecret())
      // Other tokens signed with the same secret (impersonation, admin code,
      // email verification) carry a type and never count as a login.
      if (payload.typ || payload.purpose) return null
      merchantId = payload.sub as string
      if (!merchantId) return null
      // Logins made before this change carry no version and count as 0.
      tokenVersion = typeof payload.sv === 'number' ? payload.sv : 0
    } catch {
      return null
    }
  }

  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: {
      id: true,
      email: true,
      phone: true,
      name: true,
      provider: true,
      businessName: true,
      businessLogoUrl: true,
      brandColorPrimary: true,
      brandColorSecondary: true,
      brandFont: true,
      buttonStyle: true,
      pageTheme: true,
      customDomain: true,
      bgImageUrl: true,
      supportEmail: true,
      supportPhone: true,
      status: true,
      onboardingComplete: true,
      emailVerifiedAt: true,
      sessionVersion: true,
      createdAt: true,
    },
  })

  if (!merchant || merchant.status === 'suspended') return null
  // Signed out everywhere (password reset or "sign out other devices") since this login was made.
  if (tokenVersion !== null && tokenVersion !== merchant.sessionVersion) return null
  const { sessionVersion, ...session } = merchant
  return session
}

export async function requireSession() {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  return session
}

export function merchantToJson(m: {
  id: string
  email: string
  phone: string | null
  businessName: string
  businessLogoUrl: string | null
  brandColorPrimary: string
  brandColorSecondary: string
  brandFont: string
  buttonStyle: string
  pageTheme: string
  customDomain: string | null
  bgImageUrl: string | null
  supportEmail?: string | null
  supportPhone?: string | null
  status: string
  onboardingComplete: boolean
  emailVerifiedAt?: Date | null
  createdAt: Date
}) {
  return {
    id: m.id,
    email: m.email,
    phone: m.phone,
    business_name: m.businessName,
    business_logo_url: m.businessLogoUrl,
    bg_image_url: m.bgImageUrl,
    brand_color_primary: m.brandColorPrimary,
    brand_color_secondary: m.brandColorSecondary,
    brand_font: m.brandFont,
    button_style: m.buttonStyle,
    page_theme: m.pageTheme,
    custom_domain: m.customDomain,
    // Public contact details customers see on receipts and closed links (Settings → Business profile).
    support_email: m.supportEmail ?? null,
    support_phone: m.supportPhone ?? null,
    status: m.status,
    onboarding_complete: m.onboardingComplete,
    email_verified: Boolean(m.emailVerifiedAt),
    created_at: m.createdAt.toISOString(),
  }
}
