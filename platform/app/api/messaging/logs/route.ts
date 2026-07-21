import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession()
    const { searchParams } = new URL(req.url)
    const orderId = searchParams.get('orderId')

    const where: Record<string, unknown> = { merchantId: session.id }
    if (orderId) where.orderId = orderId

    const logs = await prisma.messageLog.findMany({
      where: where as any,
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ logs })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
