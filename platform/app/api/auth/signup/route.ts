import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSession, hashPassword, merchantToJson } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    let { email, phone, password, business_name } = await req.json()

    if (!email || !phone || !password) {
      return NextResponse.json({ error: 'Email, phone, and password are required' }, { status: 400 })
    }

    email = email.toLowerCase().trim()
    phone = phone.trim()
    business_name = (business_name || '').trim()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }
    if (!/^[+]?[\d\s\-()]{7,20}$/.test(phone)) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }
    if (password.length > 128) {
      return NextResponse.json({ error: 'Password too long' }, { status: 400 })
    }
    if (business_name.length > 100) {
      return NextResponse.json({ error: 'Business name too long' }, { status: 400 })
    }

    const existing = await prisma.merchant.findFirst({
      where: { OR: [{ email }, { phone }] },
    })
    if (existing) {
      return NextResponse.json({ error: 'Account already exists with this email or phone' }, { status: 409 })
    }

    const passwordHash = await hashPassword(password)
    const merchant = await prisma.merchant.create({
      data: {
        email,
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
