import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { isTeamRole, type TeamRole } from '@/lib/team-roles'

export interface AccountForTeam {
  id: string
  email: string
  name?: string | null
  businessName?: string | null
}

export interface AccountTeamContext {
  teamMemberId: string
  merchantId: string
  role: TeamRole
  email: string
  name: string
}

interface TeamRow {
  id: string
  merchantId: string
  accountId: string | null
  email: string
  name: string | null
  role: string
  acceptedAt: Date | null
}

interface TeamDelegate {
  findFirst(args: unknown): Promise<TeamRow | null>
  create(args: unknown): Promise<TeamRow>
}

function teamDelegate(): TeamDelegate | null {
  // A stale generated client (before `prisma generate`) or a test mock may not
  // have the delegate. Treat that as "team tables are not available yet".
  return (prisma as unknown as { teamMember?: TeamDelegate }).teamMember ?? null
}

function isMissingTeamTable(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && (err.code === 'P2021' || err.code === 'P2022')
}

function safeRole(value: string): TeamRole {
  return isTeamRole(value) ? value : 'viewer'
}

function ownerName(account: AccountForTeam): string {
  return account.name?.trim() || account.businessName?.trim() || account.email
}

/**
 * Make sure the merchant owner has a team row. It is created at sign-up, but
 * this also covers accounts created before team access existed.
 */
export async function ensureOwnerMembership(account: AccountForTeam): Promise<TeamRow | null> {
  const team = teamDelegate()
  if (!team) return null

  try {
    const existing = await team.findFirst({
      where: { merchantId: account.id, role: 'owner' },
    })
    if (existing) return existing

    return await team.create({
      data: {
        merchantId: account.id,
        accountId: account.id,
        email: account.email.toLowerCase(),
        name: ownerName(account),
        role: 'owner',
        acceptedAt: new Date(),
      },
    })
  } catch (err) {
    if (isMissingTeamTable(err)) return null
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      try {
        return await team.findFirst({ where: { merchantId: account.id, role: 'owner' } })
      } catch (retryErr) {
        if (isMissingTeamTable(retryErr)) return null
        throw retryErr
      }
    }
    throw err
  }
}

/**
 * Resolve which merchant dashboard this login should open.
 *
 * - An accepted team membership wins; the member sees the owning merchant.
 * - Otherwise the account opens its own merchant, as an owner.
 */
export async function resolveAccountTeam(account: AccountForTeam): Promise<AccountTeamContext | null> {
  const team = teamDelegate()
  if (!team) return null

  try {
    const membership = await team.findFirst({
      where: {
        accountId: account.id,
        acceptedAt: { not: null },
        merchantId: { not: account.id },
      },
      orderBy: { acceptedAt: 'asc' },
    })

    if (membership) {
      // A suspended business cannot be opened. Fall back to the member's own
      // account instead of minting a session that is dead on the next request.
      const target = await prisma.merchant.findUnique({
        where: { id: membership.merchantId },
        select: { status: true },
      })
      if (target && target.status !== 'suspended') {
        return {
          teamMemberId: membership.id,
          merchantId: membership.merchantId,
          role: safeRole(membership.role),
          email: account.email,
          name: account.name?.trim() || membership.name?.trim() || account.email,
        }
      }
    }

    const owner = await ensureOwnerMembership(account)
    if (!owner) return null

    return {
      teamMemberId: owner.id,
      merchantId: account.id,
      role: 'owner',
      email: account.email,
      name: ownerName(account),
    }
  } catch (err) {
    if (isMissingTeamTable(err)) return null
    throw err
  }
}

export interface TeamMemberForJson {
  id: string
  email: string
  name: string | null
  role: string
  invitedAt: Date
  acceptedAt: Date | null
  inviteExpiresAt: Date | null
  accountId: string | null
  account?: { name: string | null } | null
}

export function teamMemberJson(member: TeamMemberForJson, viewerAccountId: string) {
  const pendingExpired = !member.acceptedAt && member.inviteExpiresAt && member.inviteExpiresAt < new Date()
  return {
    id: member.id,
    email: member.email,
    name: member.name || member.account?.name || member.email,
    role: member.role,
    status: member.acceptedAt ? 'accepted' : pendingExpired ? 'expired' : 'pending',
    is_you: member.accountId === viewerAccountId,
    invited_at: member.invitedAt.toISOString(),
    accepted_at: member.acceptedAt?.toISOString() ?? null,
    invite_expires_at: member.inviteExpiresAt?.toISOString() ?? null,
  }
}

/** Read the actor snapshot written by lib/audit.ts into audit metadata. */
export function auditActorFromMetadata(metadata: unknown): { name: string | null; email: string | null; role: string | null } | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const actor = (metadata as Record<string, unknown>).actor
  if (!actor || typeof actor !== 'object' || Array.isArray(actor)) return null
  const row = actor as Record<string, unknown>
  return {
    name: typeof row.name === 'string' ? row.name : null,
    email: typeof row.email === 'string' ? row.email : null,
    role: typeof row.role === 'string' ? row.role : null,
  }
}
