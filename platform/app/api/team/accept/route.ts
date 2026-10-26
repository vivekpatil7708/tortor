import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { apiError, publicErrorMessage } from '@/lib/api-response'
import { createSession } from '@/lib/auth'
import { hashInviteToken } from '@/lib/team-token'
import { isTeamRole, type TeamRole } from '@/lib/team-roles'
import { logAudit } from '@/lib/audit'

/** Accept an invitation as the signed-in account. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const body = (await req.json().catch(() => ({}))) as { token?: unknown }
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    if (!token || token.length > 200) return apiError(400, 'This invitation link is invalid.')

    const invite = await prisma.teamMember.findUnique({
      where: { inviteToken: hashInviteToken(token) },
      include: {
        merchant: { select: { id: true, businessName: true, name: true, email: true, status: true } },
      },
    })

    if (!invite) return apiError(404, 'This invitation link is invalid or has expired.')
    if (invite.merchant.status === 'suspended') return apiError(403, 'This business is not available.')
    if (invite.acceptedAt) return apiError(409, 'This invitation has already been accepted.')
    if (invite.inviteExpiresAt && invite.inviteExpiresAt < new Date()) {
      return apiError(410, 'This invitation has expired. Ask the owner to resend it.')
    }
    if (invite.email.toLowerCase() !== session.accountEmail.toLowerCase()) {
      return apiError(403, `This invitation was sent to ${invite.email}. Sign in with that email to accept it.`)
    }
    if (invite.role === 'owner') return apiError(400, 'This invitation is not valid.')
    if (invite.merchantId === session.accountId) {
      return apiError(400, 'You already have access to this account.')
    }

    // One team per login. A merchant owner joining another business keeps
    // their own account, but only one dashboard can be open at a time.
    const otherTeam = await prisma.teamMember.findFirst({
      where: {
        accountId: session.accountId,
        acceptedAt: { not: null },
        merchantId: { not: session.accountId },
        id: { not: invite.id },
      },
    })
    if (otherTeam) {
      return apiError(409, 'This account already belongs to another team. Ask the owner to remove you first.')
    }

    const member = await prisma.teamMember.update({
      where: { id: invite.id },
      data: {
        accountId: session.accountId,
        acceptedAt: new Date(),
        inviteToken: null,
        inviteExpiresAt: null,
        name: session.accountName || invite.name || null,
      },
    })

    const role: TeamRole = isTeamRole(member.role) ? member.role : 'viewer'
    const name = session.accountName || member.name || session.accountEmail

    await createSession(session.accountId, session.accountEmail, {
      team: {
        merchantId: member.merchantId,
        teamMemberId: member.id,
        role,
        name,
      },
    })

    await logAudit({
      merchantId: member.merchantId,
      actor: {
        teamMemberId: member.id,
        name,
        email: session.accountEmail,
        role,
      },
      action: 'team_member_joined',
      entityType: 'team_member',
      entityId: member.id,
      metadata: { email: member.email, role },
    })

    return NextResponse.json({
      success: true,
      merchant: {
        id: invite.merchant.id,
        business_name: invite.merchant.businessName || invite.merchant.name || invite.merchant.email,
      },
      role,
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === 'P2021' || err.code === 'P2022')) {
      return apiError(503, 'Team access is not set up yet. The team members database migration has not been applied.')
    }
    const msg = publicErrorMessage(err, 'Could not accept the invitation')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}
