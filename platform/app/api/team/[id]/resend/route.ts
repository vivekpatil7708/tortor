import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { apiError, notFound, publicErrorMessage } from '@/lib/api-response'
import { isOwnerRole, isTeamRole, type TeamRole } from '@/lib/team-roles'
import { createInviteToken, TEAM_INVITE_TTL_MS } from '@/lib/team-token'
import { sendTeamInviteEmail } from '@/lib/team-invite'
import { teamMemberJson } from '@/lib/team'
import { logAudit } from '@/lib/audit'

/** Send a fresh invitation link to a pending member. */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireMerchant()
    if (!isOwnerRole(session.teamRole)) return apiError(403, 'Only the account owner can resend invitations.')

    const { id } = await ctx.params
    const member = await prisma.teamMember.findFirst({ where: { id, merchantId: session.id } })
    if (!member) return notFound('Team member not found')
    if (member.acceptedAt) return apiError(400, 'This person has already joined the team.')
    if (member.role === 'owner') return apiError(400, 'The owner does not need an invitation.')

    const { token, tokenHash } = createInviteToken()
    const inviteExpiresAt = new Date(Date.now() + TEAM_INVITE_TTL_MS)
    const updated = await prisma.teamMember.update({
      where: { id: member.id },
      data: { inviteToken: tokenHash, inviteExpiresAt, invitedAt: new Date(), invitedBy: session.teamMemberId },
    })

    const role: TeamRole = isTeamRole(member.role) ? member.role : 'viewer'
    const emailSent = await sendTeamInviteEmail({
      to: member.email,
      businessName: session.businessName || 'ToroPay business',
      inviterName: session.teamMemberName || session.accountName || session.email,
      role,
      token,
    })

    await logAudit({
      merchantId: session.id,
      action: 'team_invite_resent',
      entityType: 'team_member',
      entityId: member.id,
      metadata: { email: member.email, role, email_sent: emailSent },
    })

    return NextResponse.json({
      member: teamMemberJson({ ...updated, account: null }, session.accountId),
      email_sent: emailSent,
      warning: emailSent ? null : 'The email could not be sent. Check the address and try again.',
    })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Could not resend the invitation')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}
