import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

const COOKIE_NAME = 'toropay_session'

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
  const token = await new SignJWT({ sub: merchantId, email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret())

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
}

export async function destroySession() {
  cookies().delete(COOKIE_NAME)
}

export async function getSession() {
  const token = cookies().get(COOKIE_NAME)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, getSecret())
    const merchantId = payload.sub as string
    if (!merchantId) return null

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        email: true,
        phone: true,
        businessName: true,
        businessLogoUrl: true,
        brandColorPrimary: true,
        brandColorSecondary: true,
        brandFont: true,
        buttonStyle: true,
        pageTheme: true,
        customDomain: true,
        bgImageUrl: true,
        status: true,
        onboardingComplete: true,
        createdAt: true,
      },
    })

    if (!merchant || merchant.status === 'suspended') return null
    return merchant
  } catch {
    return null
  }
}

export async function requireSession() {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  return session
}

export function merchantToJson(m: {
  id: string
  email: string
  phone: string
  businessName: string
  businessLogoUrl: string | null
  brandColorPrimary: string
  brandColorSecondary: string
  brandFont: string
  buttonStyle: string
  pageTheme: string
  customDomain: string | null
  bgImageUrl: string | null
  status: string
  onboardingComplete: boolean
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
    status: m.status,
    onboarding_complete: m.onboardingComplete,
    created_at: m.createdAt.toISOString(),
  }
}
