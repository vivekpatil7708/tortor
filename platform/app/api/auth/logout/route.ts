import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { destroySession, getSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getSession()

  if (session) {
    await prisma.auditLog.create({
      data: {
        merchantId: session.id,
        email: session.accountEmail,
        action: 'logout',
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
        userAgent: req.headers.get('user-agent'),
        metadata: {
          actor: {
            team_member_id: session.teamMemberId,
            name: session.teamMemberName,
            email: session.accountEmail,
            role: session.teamRole,
          },
        },
      },
    })
  }

  await destroySession()
  return NextResponse.json({ success: true })
}
