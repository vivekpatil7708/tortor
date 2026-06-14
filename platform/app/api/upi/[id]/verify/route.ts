import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeUpi } from '@/lib/serializers'
import { isValidVpa } from '@/lib/upi'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession()
    const upi = await prisma.upiId.findFirst({
      where: { id: params.id, merchantId: session.id },
    })
    if (!upi) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!isValidVpa(upi.vpa)) {
      return NextResponse.json({ error: 'Invalid VPA' }, { status: 400 })
    }

    const updated = await prisma.upiId.update({
      where: { id: upi.id },
      data: { verifiedAt: new Date() },
    })

    return NextResponse.json({ success: true, upi: serializeUpi(updated) })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
