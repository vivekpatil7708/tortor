import { prisma } from '@/lib/prisma'

interface AuditInput {
  merchantId: string
  actorUserId?: string | null
  action: string
  entityType: string
  entityId?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Write an audit log entry scoped to a merchant.
 */
export async function logAudit({
  merchantId,
  actorUserId = null,
  action,
  entityType,
  entityId = null,
  metadata = null,
}: AuditInput) {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { email: true },
  })
  return prisma.auditLog.create({
    data: {
      merchantId,
      email: merchant?.email ?? 'unknown',
      action,
      actorUserId,
      entityType,
      entityId,
      metadata: (metadata as object) ?? undefined,
    },
  })
}