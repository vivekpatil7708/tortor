import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSession, merchantToJson, verifyPassword } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const merchant = await prisma.merchant.findUnique({ where: { email: email.toLowerCase() } })
    if (!merchant || !(await verifyPassword(password, merchant.passwordHash))) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }
    if (merchant.status === 'suspended') {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 })
    }

    await prisma.auditLog.create({
      data: {
        merchantId: merchant.id,
        email: merchant.email,
        action: 'login',
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
        userAgent: req.headers.get('user-agent'),
      },
    })

    await createSession(merchant.id, merchant.email)
    return NextResponse.json({ success: true, merchant: merchantToJson(merchant) })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Login failed' }, { status: 500 })
  }
}
