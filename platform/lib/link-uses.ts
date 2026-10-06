import type { Prisma } from '@prisma/client'

/** A started checkout holds one of a link's limited uses for this long. */
export const CHECKOUT_HOLD_MINUTES = 30

/**
 * Payments that take up one of a link's limited uses: paid, waiting for the
 * merchant to confirm, or a checkout started in the last 30 minutes. Rejected
 * and abandoned attempts free their use again.
 */
export function usesTakenWhere(linkId: string, now = new Date()): Prisma.TransactionWhereInput {
  return {
    paymentLinkId: linkId,
    OR: [
      { status: { in: ['success', 'pending'] } },
      { status: 'initiated', createdAt: { gte: new Date(now.getTime() - CHECKOUT_HOLD_MINUTES * 60_000) } },
    ],
  }
}

type CountClient = { transaction: { count(args: { where: Prisma.TransactionWhereInput }): Promise<number> } }

/** Paid uses, and uses held by checkouts in progress (including payments waiting for the merchant). */
export async function linkUses(db: CountClient, linkId: string, now = new Date()) {
  const [paid, taken] = await Promise.all([
    db.transaction.count({ where: { paymentLinkId: linkId, status: 'success' } }),
    db.transaction.count({ where: usesTakenWhere(linkId, now) }),
  ])
  return { paid, inProgress: taken - paid, taken }
}

export type LinkRoom = 'open' | 'busy' | 'used-up'

/**
 * Whether a link can start another checkout: "used-up" once paid payments reach
 * its limit, "busy" while the remaining uses are held by payments in progress.
 */
export async function linkRoom(db: CountClient, link: { id: string; maxUses: number | null }, now = new Date()): Promise<LinkRoom> {
  if (!link.maxUses) return 'open'
  const { paid, taken } = await linkUses(db, link.id, now)
  if (paid >= link.maxUses) return 'used-up'
  return taken >= link.maxUses ? 'busy' : 'open'
}
