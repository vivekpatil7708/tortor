import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { apiError, publicErrorMessage } from '@/lib/api-response'
import { auditActorFromMetadata, teamMemberJson } from '@/lib/team'

/** The team list plus recent activity for the signed-in member. */
export async function GET() {
  try {
    const session = await requireMerchant()

    const members = await prisma.teamMember.findMany({
      where: { merchantId: session.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        invitedAt: true,
        acceptedAt: true,
        inviteExpiresAt: true,
        accountId: true,
        account: { select: { name: true } },
      },
    })

    const rank: Record<string, number> = { owner: 0, admin: 1, viewer: 2 }
    members.sort((a, b) => {
      const roleDiff = (rank[a.role] ?? 3) - (rank[b.role] ?? 3)
      if (roleDiff) return roleDiff
      const acceptedDiff = Number(Boolean(b.acceptedAt)) - Number(Boolean(a.acceptedAt))
      if (acceptedDiff) return acceptedDiff
      return a.invitedAt.getTime() - b.invitedAt.getTime()
    })

    // Recent merchant actions, including who did them. Auth noise (failed
    // logins) is left out so the panel stays readable.
    const logs = await prisma.auditLog.findMany({
      where: {
        merchantId: session.id,
        action: { notIn: ['login_failed', 'signup_attempt'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        email: true,
        metadata: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      members: members.map(member => teamMemberJson(member, session.accountId)),
      me: {
        role: session.teamRole,
        email: session.accountEmail,
        name: session.teamMemberName,
        team_member_id: session.teamMemberId,
        is_team_member: session.isTeamMember,
      },
      activity: logs.map(log => {
        const actor = auditActorFromMetadata(log.metadata)
        return {
          id: log.id,
          action: log.action,
          entity_type: log.entityType,
          entity_id: log.entityId,
          actor_name: actor?.name || log.email,
          actor_email: actor?.email || log.email,
          actor_role: actor?.role ?? null,
          created_at: log.createdAt.toISOString(),
        }
      }),
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === 'P2021' || err.code === 'P2022')) {
      return apiError(503, 'Team access is not set up yet. The team members database migration has not been applied.')
    }
    const msg = publicErrorMessage(err, 'Could not load your team')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}
