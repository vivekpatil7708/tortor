import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSession, hashPassword, merchantToJson } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { email, phone, password, business_name } = await req.json()

    if (!email || !phone || !password) {
      return NextResponse.json({ error: 'Email, phone, and password are required' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const existing = await prisma.merchant.findFirst({
      where: { OR: [{ email: email.toLowerCase() }, { phone }] },
    })
    if (existing) {
      return NextResponse.json({ error: 'Account already exists with this email or phone' }, { status: 409 })
    }

    const passwordHash = await hashPassword(password)
    const merchant = await prisma.merchant.create({
      data: {
        email: email.toLowerCase(),
        phone,
        passwordHash,
        businessName: business_name || email.split('@')[0],
        settings: { create: {} },
      },
    })

    await prisma.auditLog.create({
      data: {
        merchantId: merchant.id,
        email: merchant.email,
        action: 'signup',
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
        userAgent: req.headers.get('user-agent'),
      },
    })

    await createSession(merchant.id, merchant.email)
    return NextResponse.json({ success: true, merchant: merchantToJson(merchant) })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Signup failed' }, { status: 500 })
  }
}
