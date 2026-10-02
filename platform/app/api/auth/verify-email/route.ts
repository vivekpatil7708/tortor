import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { readEmailVerificationToken } from '@/lib/email-verification'

const INVALID_LINK = 'This verification link is invalid or has expired.'

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json().catch(() => ({ token: '' }))
    const claim = token ? await readEmailVerificationToken(String(token)) : null
    if (!claim) return NextResponse.json({ error: INVALID_LINK }, { status: 400 })

    const merchant = await prisma.merchant.findUnique({
      where: { id: claim.merchantId },
      select: { id: true, email: true, emailVerifiedAt: true },
    })
    // The link only counts for the address it was sent to.
    if (!merchant || merchant.email !== claim.email) {
      return NextResponse.json({ error: INVALID_LINK }, { status: 400 })
    }

    if (!merchant.emailVerifiedAt) {
      await prisma.merchant.update({ where: { id: merchant.id }, data: { emailVerifiedAt: new Date() } })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Email verification failed:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
