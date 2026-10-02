import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendVerificationEmail } from '@/lib/email-verification'
import { recordAttempt } from '@/lib/rate-limit'

const MAX_SENDS_PER_HOUR = 3

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    if (session.emailVerifiedAt) return NextResponse.json({ success: true, already_verified: true })

    const since = new Date(Date.now() - 60 * 60 * 1000)
    const recentSends = await prisma.auditLog.count({
      where: { action: 'verification_email_sent', merchantId: session.id, createdAt: { gte: since } },
    })
    if (recentSends >= MAX_SENDS_PER_HOUR) {
      return NextResponse.json({ error: 'Too many emails sent. Please wait an hour and try again.' }, { status: 429 })
    }

    if (!(await sendVerificationEmail({ id: session.id, email: session.email }))) {
      return NextResponse.json({ error: 'The email could not be sent. Please try again later.' }, { status: 502 })
    }
    await recordAttempt(req, 'verification_email_sent', session.email, session.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Resend verification email failed:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
