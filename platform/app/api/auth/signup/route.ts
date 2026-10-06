import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSession, hashPassword, merchantToJson } from '@/lib/auth'
import { publicErrorMessage } from '@/lib/api-response'
import { sendVerificationEmail } from '@/lib/email-verification'
import { passwordProblem } from '@/lib/password-policy'
import { isRateLimited, recordAttempt } from '@/lib/rate-limit'

// Limits how fast one network can try sign-ups, so it can't check many emails
// or phone numbers for existing accounts.
const MAX_SIGNUPS_PER_IP = 10
const SIGNUP_WINDOW_MIN = 60

export async function POST(req: NextRequest) {
  try {
    let { email, phone, password, business_name } = await req.json()

    if (!email || !phone || !password) {
      return NextResponse.json({ error: 'Email, phone, and password are required' }, { status: 400 })
    }

    email = email.toLowerCase().trim()
    phone = phone.trim()
    business_name = (business_name || '').trim()

    if (await isRateLimited(req, 'signup_attempt', MAX_SIGNUPS_PER_IP, SIGNUP_WINDOW_MIN)) {
      return NextResponse.json({ error: 'Too many sign-up attempts from your network. Please try again later.' }, { status: 429 })
    }
    await recordAttempt(req, 'signup_attempt', email)

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }
    if (!/^[+]?[\d\s\-()]{7,20}$/.test(phone)) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
    }
    const problem = passwordProblem(password)
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 })
    }
    if (business_name.length > 100) {
      return NextResponse.json({ error: 'Business name too long' }, { status: 400 })
    }

    const existing = await prisma.merchant.findFirst({
      where: { OR: [{ email }, { phone }] },
    })
    if (existing) {
      return NextResponse.json(
        { error: "We couldn't create an account with these details. If you already have an account, log in or reset your password." },
        { status: 409 }
      )
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

    // The account can't take payments until the owner proves the email is theirs.
    const verificationSent = await sendVerificationEmail(merchant)

    await createSession(merchant.id, merchant.email)
    return NextResponse.json({ success: true, merchant: merchantToJson(merchant), email_verification_sent: verificationSent })
  } catch (err: unknown) {
    return NextResponse.json({ error: publicErrorMessage(err, 'Signup failed') }, { status: 500 })
  }
}
