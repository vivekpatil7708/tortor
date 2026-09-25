import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const status = req.nextUrl.searchParams.get('status')
    const take = Math.min(Number(req.nextUrl.searchParams.get('limit') || 50), 200)

    const logs = await prisma.emailLog.findMany({
      where: {
        merchantId: session.id,
        ...(status ? { status: status as never } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    })

    return NextResponse.json(
      logs.map(l => ({
        id: l.id,
        template_key: l.templateKey,
        recipient: l.recipient,
        subject: l.subject,
        status: l.status,
        provider: l.provider,
        error_message: l.errorMessage,
        created_at: l.createdAt.toISOString(),
      }))
    )
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}