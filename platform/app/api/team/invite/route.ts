import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { apiError, publicErrorMessage } from '@/lib/api-response'
import { EMAIL_NOT_VERIFIED } from '@/lib/email-verification'
import { isOwnerRole, isTeamRole, type TeamRole } from '@/lib/team-roles'
import { createInviteToken, TEAM_INVITE_TTL_MS } from '@/lib/team-token'
import { sendTeamInviteEmail } from '@/lib/team-invite'
import { teamMemberJson } from '@/lib/team'
import { logAudit } from '@/lib/audit'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Invite someone to this merchant's dashboard as an admin or viewer. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireMerchant()
    if (!isOwnerRole(session.teamRole)) return apiError(403, 'Only the account owner can invite team members.')
    if (!session.emailVerifiedAt) return apiError(403, EMAIL_NOT_VERIFIED)

    const body = (await req.json().catch(() => ({}))) as { email?: unknown; role?: unknown }
    const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : ''
    const role = body.role as TeamRole

    if (!EMAIL.test(email) || email.length > 320) return apiError(400, 'Enter a valid email address.')
    if (role !== 'admin' && role !== 'viewer') return apiError(400, 'Choose admin or viewer access.')

    const accountEmail = session.accountEmail.toLowerCase()
    const merchantEmail = session.email.toLowerCase()
    if (email === accountEmail || email === merchantEmail) {
      return apiError(400, 'You already have access to this account.')
    }

    const existing = await prisma.teamMember.findFirst({
      where: { merchantId: session.id, email },
    })
    if (existing?.acceptedAt) {
      return apiError(409, 'This person is already on your team.')
    }

    const { token, tokenHash } = createInviteToken()
    const inviteExpiresAt = new Date(Date.now() + TEAM_INVITE_TTL_MS)
    const inviterName = session.teamMemberName || session.accountName || session.email

    const member = existing
      ? await prisma.teamMember.update({
          where: { id: existing.id },
          data: {
            role,
            invitedAt: new Date(),
            invitedBy: session.teamMemberId,
            inviteToken: tokenHash,
            inviteExpiresAt,
          },
        })
      : await prisma.teamMember.create({
          data: {
            merchantId: session.id,
            email,
            role,
            invitedBy: session.teamMemberId,
            inviteToken: tokenHash,
            inviteExpiresAt,
          },
        })

    const emailSent = await sendTeamInviteEmail({
      to: email,
      businessName: session.businessName || 'ToroPay business',
      inviterName,
      role: isTeamRole(role) ? role : 'viewer',
      token,
    })

    await logAudit({
      merchantId: session.id,
      action: existing ? 'team_invite_resent' : 'team_member_invited',
      entityType: 'team_member',
      entityId: member.id,
      metadata: { email, role, email_sent: emailSent },
    })

    return NextResponse.json(
      {
        member: teamMemberJson({ ...member, account: null }, session.accountId),
        email_sent: emailSent,
        warning: emailSent ? null : 'The invitation was saved, but the email could not be sent. Use Resend to try again.',
      },
      { status: existing ? 200 : 201 }
    )
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return apiError(409, 'This person is already on your team.')
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === 'P2021' || err.code === 'P2022')) {
      return apiError(503, 'Team access is not set up yet. The team members database migration has not been applied.')
    }
    const msg = publicErrorMessage(err, 'Could not send the invitation')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}
