import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

/** The admin who is signed in, as `requireAdmin` returns them. */
export interface AdminSession {
  id: string
  email: string
}

/**
 * Writes a row in the audit log for something an admin did. A failure to
 * write the row is logged but never blocks the action that was audited.
 */
export async function recordAdminAction(
  session: AdminSession,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        email: session.email,
        merchantId: session.id,
        actorUserId: session.id,
        entityType,
        entityId,
        metadata: metadata as Prisma.InputJsonValue | undefined,
      },
    })
  } catch (err) {
    console.error('Could not write the audit log:', err)
  }
}
