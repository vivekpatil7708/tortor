import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ logId: string }> }
) {
  const session = await getSession()
  if (!session?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { logId } = await params

  // Verify the log belongs to this merchant
  const log = await prisma.emailLog.findFirst({
    where: { id: logId, merchantId: session.id },
    select: { id: true },
  })

  if (!log) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const opens = await prisma.emailOpenEvent.findMany({
    where: { emailLogId: logId },
    orderBy: { openedAt: 'desc' },
    select: {
      id: true,
      emailLogId: true,
      openedAt: true,
      ipAddress: true,
      userAgent: true,
    },
  })

  return NextResponse.json({
    opens: opens.map(o => ({
      id: o.id,
      email_log_id: o.emailLogId,
      opened_at: o.openedAt.toISOString(),
      ip_address: o.ipAddress,
      user_agent: o.userAgent,
    })),
  })
}