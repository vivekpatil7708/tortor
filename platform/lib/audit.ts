import { prisma } from '@/lib/prisma'
import { getAuditActor, type AuditActor } from '@/lib/audit-context'

interface AuditInput {
  merchantId: string
  actorUserId?: string | null
  /** Override the request actor (e.g. when a member accepts an invitation). */
  actor?: AuditActor | null
  action: string
  entityType: string
  entityId?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Write an audit log entry scoped to a merchant.
 *
 * The actor from the request context is copied into metadata, which powers
 * "Recent activity" on the team page. It is metadata rather than columns so
 * this works on databases that have not run the latest audit migration.
 */
export async function logAudit({
  merchantId,
  actorUserId = null,
  actor,
  action,
  entityType,
  entityId = null,
  metadata = null,
}: AuditInput) {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { email: true },
  })

  const current = actor === undefined ? await getAuditActor() : actor
  const data: Record<string, unknown> = metadata ? { ...metadata } : {}
  if (current) {
    data.actor = {
      team_member_id: current.teamMemberId ?? null,
      name: current.name ?? null,
      email: current.email ?? null,
      role: current.role ?? null,
    }
  }

  return prisma.auditLog.create({
    data: {
      merchantId,
      email: current?.email || merchant?.email || 'unknown',
      action,
      actorUserId,
      entityType,
      entityId,
      metadata: Object.keys(data).length ? (data as object) : undefined,
    },
  })
}
