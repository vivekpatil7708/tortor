import { NextResponse } from 'next/server'
import { jwtVerify, importJWK } from 'jose'
import { prisma } from '@/lib/prisma'
import { createSession, merchantToJson } from '@/lib/auth'

export async function POST(req: Request) {
  try {
    const { credential } = await req.json()

    if (!credential) {
      return NextResponse.json({ error: 'Missing Google credential' }, { status: 400 })
    }

    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    if (!clientId) {
      return NextResponse.json({ error: 'Google auth not configured' }, { status: 500 })
    }

    const payload = await verifyGoogleToken(credential, clientId)

    if (!payload || !payload.email) {
      return NextResponse.json({ error: 'Invalid Google token' }, { status: 401 })
    }

    const email = String(payload.email).toLowerCase()
    const name = String(payload.name || '')
    const avatarUrl = (payload.picture as string) || null

    let merchant = await prisma.merchant.findUnique({ where: { email } })
    let isNewUser = false

    if (!merchant) {
      merchant = await prisma.merchant.create({
        data: {
          email,
          name,
          avatarUrl,
          provider: 'google',
          businessName: '',
        },
      })
      isNewUser = true

      await prisma.auditLog.create({
        data: {
          merchantId: merchant.id,
          email,
          action: 'signup_google',
          ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
          userAgent: req.headers.get('user-agent') || 'unknown',
        },
      })
    } else {
      if (merchant.status === 'suspended') {
        return NextResponse.json({ error: 'Account suspended' }, { status: 403 })
      }

      if (!merchant.provider || merchant.provider === 'email') {
        await prisma.merchant.update({
          where: { id: merchant.id },
          data: { provider: 'google' },
        })
      }

      if (name && !merchant.name) {
        await prisma.merchant.update({
          where: { id: merchant.id },
          data: { name },
        })
      }

      if (avatarUrl && !merchant.avatarUrl) {
        await prisma.merchant.update({
          where: { id: merchant.id },
          data: { avatarUrl },
        })
      }

      await prisma.auditLog.create({
        data: {
          merchantId: merchant.id,
          email,
          action: 'login_google',
          ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
          userAgent: req.headers.get('user-agent') || 'unknown',
        },
      })
    }

    await createSession(merchant.id, merchant.email)

    return NextResponse.json({
      success: true,
      isNewUser,
      merchant: merchantToJson({
        id: merchant.id,
        email: merchant.email,
        phone: merchant.phone,
        businessName: merchant.businessName,
        businessLogoUrl: merchant.businessLogoUrl,
        brandColorPrimary: merchant.brandColorPrimary,
        brandColorSecondary: merchant.brandColorSecondary,
        brandFont: merchant.brandFont,
        buttonStyle: merchant.buttonStyle,
        pageTheme: merchant.pageTheme,
        customDomain: merchant.customDomain,
        bgImageUrl: merchant.bgImageUrl,
        status: merchant.status,
        onboardingComplete: merchant.onboardingComplete,
        createdAt: merchant.createdAt,
      }),
    })
  } catch (err: any) {
    console.error('Google auth error:', err)
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
  }
}

async function verifyGoogleToken(token: string, audience: string) {
  try {
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString())
    const kid = header.kid

    const response = await fetch('https://www.googleapis.com/oauth2/v3/certs', {
      next: { revalidate: 3600 },
    })
    const { keys } = await response.json()

    const key = keys.find((k: any) => k.kid === kid)
    if (!key) return null

    const publicKey = await importJWK(key, 'RS256')

    const { payload } = await jwtVerify(token, publicKey, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: audience,
    })

    return payload
  } catch {
    return null
  }
}
