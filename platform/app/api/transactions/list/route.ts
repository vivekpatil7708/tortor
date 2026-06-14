import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeTransaction } from '@/lib/serializers'

export async function GET() {
  try {
    const session = await requireSession()
    const txns = await prisma.transaction.findMany({
      where: { merchantId: session.id },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    return NextResponse.json(txns.map(serializeTransaction))
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
