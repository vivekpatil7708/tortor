import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { apiError, notFound, publicErrorMessage } from '@/lib/api-response'
import { isOwnerRole, type TeamRole } from '@/lib/team-roles'
import { teamMemberJson } from '@/lib/team'
import { logAudit } from '@/lib/audit'

async function endMemberSessions(accountId: string | null) {
  if (!accountId) return
  try {
    // A role change or removal must take effect immediately. Bumping the
    // account's version ends its current logins; the next login resolves the
    // new role (or their own account, after removal).
    await prisma.merchant.update({
      where: { id: accountId },
      data: { sessionVersion: { increment: 1 } },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return
    throw err
  }
}

/** Change a member's role. The owner row cannot be changed. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireMerchant()
    if (!isOwnerRole(session.teamRole)) return apiError(403, 'Only the account owner can change roles.')

    const { id } = await ctx.params
    const member = await prisma.teamMember.findFirst({ where: { id, merchantId: session.id } })
    if (!member) return notFound('Team member not found')
    if (member.role === 'owner') return apiError(400, 'The account owner role cannot be changed.')

    const body = (await req.json().catch(() => ({}))) as { role?: unknown }
    const role = body.role as TeamRole
    if (role !== 'admin' && role !== 'viewer') return apiError(400, 'Choose admin or viewer access.')
    if (role === member.role) return NextResponse.json({ member: teamMemberJson({ ...member, account: null }, session.accountId) })

    const updated = await prisma.teamMember.update({ where: { id: member.id }, data: { role } })

    // Pending invitations just carry the new role. Accepted members are
    // signed out so the dashboard picks up their new permissions.
    if (member.acceptedAt) await endMemberSessions(member.accountId)

    await logAudit({
      merchantId: session.id,
      action: 'team_member_role_changed',
      entityType: 'team_member',
      entityId: member.id,
      metadata: { email: member.email, from: member.role, to: role },
    })

    return NextResponse.json({ member: teamMemberJson({ ...updated, account: null }, session.accountId) })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Could not update the team member')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}

/** Remove a member. Their historical audit entries keep the author snapshot. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireMerchant()
    if (!isOwnerRole(session.teamRole)) return apiError(403, 'Only the account owner can remove team members.')

    const { id } = await ctx.params
    const member = await prisma.teamMember.findFirst({ where: { id, merchantId: session.id } })
    if (!member) return notFound('Team member not found')
    if (member.role === 'owner') return apiError(400, 'The account owner cannot be removed.')

    await endMemberSessions(member.accountId)
    await prisma.teamMember.delete({ where: { id: member.id } })

    await logAudit({
      merchantId: session.id,
      action: 'team_member_removed',
      entityType: 'team_member',
      entityId: member.id,
      metadata: { email: member.email, role: member.role },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Could not remove the team member')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}
