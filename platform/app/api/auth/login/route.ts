import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSession, merchantToJson, verifyPassword } from '@/lib/auth'

const MAX_LOGIN_ATTEMPTS = 5
const LOCK_DURATION_MIN = 15
const ip = (req: NextRequest) => req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip')

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    const merchant = await prisma.merchant.findUnique({ where: { email: normalizedEmail } })

    if (merchant?.lockedUntil && merchant.lockedUntil > new Date()) {
      const remaining = Math.ceil((merchant.lockedUntil.getTime() - Date.now()) / 60000)
      return NextResponse.json({ error: `Account locked. Try again in ${remaining} minutes.` }, { status: 429 })
    }

    if (!merchant || !(await verifyPassword(password, merchant.passwordHash))) {
      if (merchant) {
        const attempts = merchant.loginAttempts + 1
        const update: Record<string, unknown> = { loginAttempts: attempts }
        if (attempts >= MAX_LOGIN_ATTEMPTS) {
          update.lockedUntil = new Date(Date.now() + LOCK_DURATION_MIN * 60 * 1000)
          update.loginAttempts = 0
        }
        await prisma.merchant.update({ where: { id: merchant.id }, data: update })
      }
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    if (merchant.status === 'suspended') {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 })
    }

    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { loginAttempts: 0, lockedUntil: null },
    })

    await prisma.auditLog.create({
      data: {
        merchantId: merchant.id,
        email: merchant.email,
        action: 'login',
        ipAddress: ip(req),
        userAgent: req.headers.get('user-agent'),
      },
    })

    await createSession(merchant.id, merchant.email)
    return NextResponse.json({ success: true, merchant: merchantToJson(merchant) })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Login failed' }, { status: 500 })
  }
}
