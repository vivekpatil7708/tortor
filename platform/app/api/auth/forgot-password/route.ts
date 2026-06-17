import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { Resend } from 'resend'
import { prisma } from '@/lib/prisma'
import { renderResetEmail } from '@/lib/email'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const merchant = await prisma.merchant.findUnique({ where: { email: normalizedEmail } })

    if (!merchant) {
      return NextResponse.json({ success: true, message: 'If the account exists, a reset link will be sent.' })
    }

    const token = crypto.randomBytes(32).toString('hex')
    const expiry = new Date(Date.now() + 60 * 60 * 1000)

    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { resetToken: token, resetTokenExpiry: expiry },
    })

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const resetLink = `${baseUrl}/reset-password?token=${token}`

    if (resend) {
      await resend.emails.send({
        from: 'ToroPay <noreply@toropay.in>',
        to: normalizedEmail,
        subject: 'Reset your ToroPay password',
        html: renderResetEmail({ resetLink, businessName: merchant.businessName }),
      })
      return NextResponse.json({ success: true, message: 'Reset link sent to your email.' })
    }

    return NextResponse.json({
      success: true,
      message: 'Reset link generated.',
      reset_link: resetLink,
      note: 'No email service configured. In production, this would be emailed. For now, use the link below.',
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
