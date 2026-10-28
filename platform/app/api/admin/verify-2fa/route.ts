import { NextRequest, NextResponse } from 'next/server'
import { clearImpersonation, getSession } from '@/lib/auth'
import { grantAdminSecondFactor, isAdminEmail } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { isRateLimited, recordAttempt } from '@/lib/rate-limit'
import { verifyTotp } from '@/lib/totp'

const MAX_FAILURES_PER_IP = 5
const MAX_FAILURES_PER_ACCOUNT = 10
const WINDOW_MIN = 15

/** Second login step for the admin console: a code from the admin's authenticator app. */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !isAdminEmail(session.accountEmail) || !session.accountEmailVerifiedAt) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const secret = process.env.ADMIN_TOTP_SECRET
    if (!secret) {
      return NextResponse.json(
        { error: 'Admin two-factor is not set up yet. Add ADMIN_TOTP_SECRET in Vercel and redeploy.' },
        { status: 503 }
      )
    }

    const since = new Date(Date.now() - WINDOW_MIN * 60 * 1000)
    const accountFailures = await prisma.auditLog.count({
      where: { action: 'admin_2fa_failed', merchantId: session.accountId, createdAt: { gte: since } },
    })
    if (accountFailures >= MAX_FAILURES_PER_ACCOUNT || (await isRateLimited(req, 'admin_2fa_failed', MAX_FAILURES_PER_IP, WINDOW_MIN))) {
      return NextResponse.json({ error: `Too many wrong codes. Try again in ${WINDOW_MIN} minutes.` }, { status: 429 })
    }

    const { code } = await req.json().catch(() => ({ code: '' }))
    if (!verifyTotp(secret, String(code ?? ''))) {
      await recordAttempt(req, 'admin_2fa_failed', session.accountEmail, session.accountId)
      return NextResponse.json({ error: 'That code is not correct. Check your authenticator app and try again.' }, { status: 401 })
    }

    // A successful admin check leaves merchant view so /admin opens the admin
    // console rather than the impersonated merchant dashboard.
    await clearImpersonation()
    await grantAdminSecondFactor(session.accountId)
    await recordAttempt(req, 'admin_2fa_passed', session.accountEmail, session.accountId)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Admin two-factor check failed:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
