import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSession, endAllSessions, getSession } from '@/lib/auth'

/** Signs the account out on every other device; this device gets a fresh login. */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // The version lives on the login account, which is not necessarily the
  // merchant whose dashboard is open (a team member's own account).
  await endAllSessions(session.accountId)
  await createSession(session.accountId, session.accountEmail, {
    team: session.teamMemberId
      ? {
          merchantId: session.id,
          teamMemberId: session.teamMemberId,
          role: session.teamRole,
          name: session.teamMemberName,
        }
      : undefined,
  })

  await prisma.auditLog.create({
    data: {
      merchantId: session.id,
      email: session.accountEmail,
      action: 'logout_other_devices',
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

  return NextResponse.json({ success: true })
}
