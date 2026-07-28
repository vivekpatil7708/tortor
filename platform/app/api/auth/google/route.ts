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

    let payload
    try {
      payload = await verifyGoogleToken(credential, clientId)
    } catch (e: any) {
      return NextResponse.json({ error: 'Token verification failed' }, { status: 401 })
    }

    if (!payload || !payload.email) {
      return NextResponse.json({ error: 'Invalid Google token' }, { status: 401 })
    }

    const email = String(payload.email).toLowerCase()
    const name = String(payload.name || '')
    const avatarUrl = (payload.picture as string) || null

    let merchant
    try {
      merchant = await prisma.merchant.findUnique({ where: { email } })
    } catch (e: any) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
    }

    let isNewUser = false

    if (!merchant) {
      try {
        merchant = await prisma.merchant.create({
          data: {
            email,
            name,
            avatarUrl,
            provider: 'google',
            businessName: '',
          },
        })
      } catch (e: any) {
        return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
      }
      isNewUser = true
    } else {
      if (merchant.status === 'suspended') {
        return NextResponse.json({ error: 'Account suspended' }, { status: 403 })
      }

      try {
        if (!merchant.provider || merchant.provider === 'email') {
          await prisma.merchant.update({
            where: { id: merchant.id },
            data: { provider: 'google' },
          })
        }
      } catch (e: any) {
        return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
      }
    }

    try {
      await createSession(merchant.id, merchant.email)
    } catch (e: any) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
    }

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
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
  }
}

async function verifyGoogleToken(token: string, audience: string) {
  const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString())
  const kid = header.kid

  const response = await fetch('https://www.googleapis.com/oauth2/v3/certs')
  const { keys } = await response.json()

  const key = keys.find((k: any) => k.kid === kid)
  if (!key) throw new Error('No matching key for kid: ' + kid)

  const publicKey = await importJWK(key, 'RS256')

  const { payload } = await jwtVerify(token, publicKey, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: audience,
  })

  return payload
}
