import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeUpi } from '@/lib/serializers'
import { isValidVpa, verifyVpaWithSetu } from '@/lib/upi'

export async function GET() {
  try {
    const session = await requireSession()
    const upis = await prisma.upiId.findMany({
      where: { merchantId: session.id },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(upis.map(serializeUpi))
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    const { vpa } = await req.json()
    const normalized = String(vpa || '').toLowerCase().trim()

    if (!isValidVpa(normalized)) {
      return NextResponse.json({ error: 'Invalid VPA format (e.g. merchant@paytm)' }, { status: 400 })
    }

    const verification = await verifyVpaWithSetu(normalized)
    if (!verification.valid) {
      return NextResponse.json({ error: 'VPA could not be verified' }, { status: 400 })
    }

    const count = await prisma.upiId.count({ where: { merchantId: session.id } })
    const upi = await prisma.upiId.create({
      data: {
        merchantId: session.id,
        vpa: normalized,
        isPrimary: count === 0,
        verifiedAt: process.env.SETU_CLIENT_ID ? new Date() : null,
      },
    })

    return NextResponse.json({ success: true, upi: serializeUpi(upi) })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to add UPI'
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: 'This UPI ID is already added' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}
