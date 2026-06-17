import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const merchant = await prisma.merchant.findUnique({ where: { email: normalizedEmail } })

    if (!merchant) {
      return NextResponse.json({ success: true, message: 'If the account exists, a reset link will be provided.' })
    }

    const token = crypto.randomBytes(32).toString('hex')
    const expiry = new Date(Date.now() + 60 * 60 * 1000)

    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { resetToken: token, resetTokenExpiry: expiry },
    })

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const resetLink = `${baseUrl}/reset-password?token=${token}`

    return NextResponse.json({
      success: true,
      message: 'Reset link generated.',
      reset_link: resetLink,
      note: 'In production, this link would be emailed to you.',
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
