import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logs = await prisma.emailLog.findMany({
    where: { merchantId: session.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      templateKey: true,
      recipient: true,
      subject: true,
      status: true,
      createdAt: true,
      _count: { select: { openEvents: true } },
      openEvents: { take: 1, orderBy: { openedAt: 'desc' }, select: { openedAt: true } },
    },
  })

  return NextResponse.json({
    logs: logs.map(log => ({
      id: log.id,
      template_key: log.templateKey,
      recipient: log.recipient,
      subject: log.subject,
      status: log.status,
      created_at: log.createdAt.toISOString(),
      open_count: log._count.openEvents,
      last_opened_at: log.openEvents[0]?.openedAt.toISOString() ?? null,
    })),
  })
}