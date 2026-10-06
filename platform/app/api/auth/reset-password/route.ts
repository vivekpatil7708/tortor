import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth'
import { publicErrorMessage } from '@/lib/api-response'
import { passwordProblem } from '@/lib/password-policy'
import { hashResetToken } from '@/lib/reset-token'

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json()

    if (!token || !password) {
      return NextResponse.json({ error: 'Token and password are required' }, { status: 400 })
    }
    const problem = passwordProblem(password)
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 })
    }

    // The database holds only the token's fingerprint.
    const merchant = await prisma.merchant.findFirst({
      where: { resetToken: hashResetToken(String(token)), resetTokenExpiry: { gte: new Date() } },
    })

    if (!merchant) {
      return NextResponse.json({ error: 'Invalid or expired reset token' }, { status: 400 })
    }

    const passwordHash = await hashPassword(password)

    await prisma.merchant.update({
      where: { id: merchant.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
        loginAttempts: 0,
        lockedUntil: null,
        // Signs out every device, including anyone using the old password.
        sessionVersion: { increment: 1 },
      },
    })

    return NextResponse.json({ success: true, message: 'Password reset successfully' })
  } catch (err: unknown) {
    return NextResponse.json({ error: publicErrorMessage(err, 'Failed') }, { status: 500 })
  }
}
