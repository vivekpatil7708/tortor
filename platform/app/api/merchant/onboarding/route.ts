import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { handleError } from '@/lib/api-response'
import { prisma } from '@/lib/prisma'

export async function POST() {
  try {
    const session = await requireSession()
    await prisma.merchant.update({
      where: { id: session.id },
      data: { onboardingComplete: true },
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handleError(err, 'Could not finish setting up your account')
  }
}
