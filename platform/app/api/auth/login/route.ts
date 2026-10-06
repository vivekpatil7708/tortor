import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { clearImpersonation, createSession, merchantToJson, verifyPassword } from '@/lib/auth'
import { publicErrorMessage } from '@/lib/api-response'
import { clientIp, isRateLimited, recordAttempt } from '@/lib/rate-limit'

const MAX_LOGIN_ATTEMPTS = 5
const LOCK_DURATION_MIN = 15
const MAX_FAILURES_PER_IP = 20
const IP_WINDOW_MIN = 15

// Login answers the same way whether or not an account exists, so it can't be
// used to find out which emails belong to ToroPay merchants.
const INVALID = 'Invalid email or password'
const TOO_MANY = `Too many failed attempts. Please wait ${LOCK_DURATION_MIN} minutes and try again.`
// Checked when there's no password to compare, so every failure takes as long as a real check.
const DUMMY_HASH = '$2a$12$6GjD8x4FBCsoVbhxLq4viem4COOIFAYX8zenDbc2CkYvjrAlQ1E7C'

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

    if (await isRateLimited(req, 'login_failed', MAX_FAILURES_PER_IP, IP_WINDOW_MIN)) {
      return NextResponse.json(
        { error: `Too many failed logins from your network. Try again in ${IP_WINDOW_MIN} minutes.` },
        { status: 429 }
      )
    }

    // Counted per typed email, so an unknown email locks out exactly like a real one.
    const since = new Date(Date.now() - LOCK_DURATION_MIN * 60 * 1000)
    const recentFailures = await prisma.auditLog.count({
      where: { action: 'login_failed', email: normalizedEmail, createdAt: { gte: since } },
    })
    if (recentFailures >= MAX_LOGIN_ATTEMPTS) {
      return NextResponse.json({ error: TOO_MANY }, { status: 429 })
    }

    const merchant = await prisma.merchant.findUnique({ where: { email: normalizedEmail } })

    if (merchant?.lockedUntil && merchant.lockedUntil > new Date()) {
      return NextResponse.json({ error: TOO_MANY }, { status: 429 })
    }

    // Unknown email, Google-only account or wrong password: all get the same answer.
    const passwordOk = await verifyPassword(password, merchant?.passwordHash || DUMMY_HASH)
    if (!merchant || !merchant.passwordHash || !passwordOk) {
      await recordAttempt(req, 'login_failed', normalizedEmail, merchant?.id ?? null)
      if (merchant?.passwordHash) {
        // Increment in the database so parallel guesses can't skip the lock.
        const { loginAttempts } = await prisma.merchant.update({
          where: { id: merchant.id },
          data: { loginAttempts: { increment: 1 } },
          select: { loginAttempts: true },
        })
        if (loginAttempts >= MAX_LOGIN_ATTEMPTS) {
          await prisma.merchant.update({
            where: { id: merchant.id },
            data: { lockedUntil: new Date(Date.now() + LOCK_DURATION_MIN * 60 * 1000), loginAttempts: 0 },
          })
        }
      }
      return NextResponse.json({ error: INVALID }, { status: 401 })
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
        ipAddress: clientIp(req),
        userAgent: req.headers.get('user-agent'),
      },
    })

    await clearImpersonation()
    await createSession(merchant.id, merchant.email)
    return NextResponse.json({ success: true, merchant: merchantToJson(merchant) })
  } catch (err: unknown) {
    return NextResponse.json({ error: publicErrorMessage(err, 'Login failed') }, { status: 500 })
  }
}
