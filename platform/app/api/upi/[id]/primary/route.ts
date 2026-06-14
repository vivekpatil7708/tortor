import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession()
    const upi = await prisma.upiId.findFirst({
      where: { id: params.id, merchantId: session.id },
    })
    if (!upi) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.upiId.updateMany({
      where: { merchantId: session.id },
      data: { isPrimary: false },
    })
    await prisma.upiId.update({
      where: { id: upi.id },
      data: { isPrimary: true },
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
