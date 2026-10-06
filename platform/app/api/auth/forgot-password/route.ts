import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { prisma } from '@/lib/prisma'
import { renderResetEmail } from '@/lib/email'
import { isRateLimited, recordAttempt } from '@/lib/rate-limit'
import { newResetToken } from '@/lib/reset-token'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const fromAddress = process.env.RESEND_FROM || 'ToroPay <onboarding@resend.dev>'

const RESET_TTL_MS = 60 * 60 * 1000
const MAX_REQUESTS_PER_IP = 5
const IP_WINDOW_MIN = 60
// Same answer whether or not the account exists, so this can't be used to find accounts.
const SENT_MESSAGE = 'If an account exists for this email, we have sent a password reset link.'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    if (await isRateLimited(req, 'password_reset_requested', MAX_REQUESTS_PER_IP, IP_WINDOW_MIN)) {
      return NextResponse.json({ error: 'Too many reset requests. Please try again later.' }, { status: 429 })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const merchant = await prisma.merchant.findUnique({ where: { email: normalizedEmail } })
    await recordAttempt(req, 'password_reset_requested', normalizedEmail, merchant?.id ?? null)

    if (!merchant) {
      return NextResponse.json({ success: true, message: SENT_MESSAGE })
    }

    // At most one reset email per minute for each account.
    if (merchant.resetTokenExpiry && merchant.resetTokenExpiry.getTime() - Date.now() > RESET_TTL_MS - 60 * 1000) {
      return NextResponse.json({ success: true, message: SENT_MESSAGE })
    }

    // The email gets the token; the database keeps only its fingerprint.
    const { token, stored } = newResetToken()
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { resetToken: stored, resetTokenExpiry: new Date(Date.now() + RESET_TTL_MS) },
    })

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const resetLink = `${baseUrl}/reset-password?token=${token}`

    // The link only ever goes to the account's inbox, never back to the requester.
    if (!resend) {
      console.error('Password reset email not sent: RESEND_API_KEY is not set')
      return NextResponse.json({ success: true, message: SENT_MESSAGE })
    }

    try {
      const { error } = await resend.emails.send({
        from: fromAddress,
        to: normalizedEmail,
        subject: 'Reset your ToroPay password',
        html: renderResetEmail({ resetLink, businessName: merchant.businessName }),
      })
      if (error) console.error('Password reset email failed:', error.message)
    } catch (err) {
      console.error('Password reset email failed:', err)
    }

    return NextResponse.json({ success: true, message: SENT_MESSAGE })
  } catch (err: unknown) {
    console.error('Forgot password failed:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
