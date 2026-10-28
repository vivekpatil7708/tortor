import { prisma } from '@/lib/prisma'
import { loyaltyPointsForAmount } from '@/lib/loyalty-rules'
import type { Transaction } from '@prisma/client'

// Loyalty points are an append-only ledger. A customer's balance is the sum of
// their rows, so an automatic award, a manual correction and a deduction all
// leave a visible reason behind.

export type LoyaltyTransaction = Pick<
  Transaction,
  'id' | 'merchantId' | 'txnId' | 'amount' | 'customerName' | 'customerPhone' | 'customerEmail'
>

/**
 * A payment-link transaction carries the customer's name, phone and email, not
 * a customer id. Reuse a matching customer (phone first), or create one so the
 * points have somewhere to live.
 */
export async function findOrCreateLoyaltyCustomer(txn: Pick<
  LoyaltyTransaction,
  'merchantId' | 'customerName' | 'customerPhone' | 'customerEmail'
>) {
  const phone = txn.customerPhone?.trim().slice(0, 30) || null
  const email = txn.customerEmail?.trim().toLowerCase().slice(0, 200) || null
  if (!phone && !email) return null

  let customer = phone
    ? await prisma.customer.findFirst({ where: { merchantId: txn.merchantId, phone } })
    : null
  if (!customer && email) {
    customer = await prisma.customer.findFirst({
      where: { merchantId: txn.merchantId, email: { equals: email, mode: 'insensitive' } },
    })
  }

  if (customer) {
    const updates: { phone?: string; email?: string } = {}
    if (phone && !customer.phone) updates.phone = phone
    if (email && !customer.email) updates.email = email
    if (Object.keys(updates).length) {
      customer = await prisma.customer.update({ where: { id: customer.id }, data: updates })
    }
    return customer
  }

  return prisma.customer.create({
    data: {
      merchantId: txn.merchantId,
      fullName: (txn.customerName?.trim() || phone || email || 'Customer').slice(0, 120),
      phone,
      email,
    },
  })
}

/**
 * Award points once for a confirmed payment. If the merchant has earning turned
 * off, no points and no customer record are created.
 */
export async function awardLoyaltyPointsForTransaction(txn: LoyaltyTransaction) {
  const existing = await prisma.loyaltyPoint.findUnique({ where: { transactionId: txn.id } })
  if (existing) return existing

  const merchant = await prisma.merchant.findUnique({
    where: { id: txn.merchantId },
    select: { loyaltyPointsPerRupee: true },
  })
  const points = loyaltyPointsForAmount(txn.amount, merchant?.loyaltyPointsPerRupee ?? 0)
  if (points <= 0) return null

  const customer = await findOrCreateLoyaltyCustomer(txn)
  if (!customer) return null

  try {
    return await prisma.loyaltyPoint.create({
      data: {
        merchantId: txn.merchantId,
        customerId: customer.id,
        points,
        reason: `Payment confirmed (${txn.txnId})`,
        transactionId: txn.id,
      },
    })
  } catch (err) {
    // Two confirmations at once can race; the unique transaction id keeps one row.
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
      return prisma.loyaltyPoint.findUnique({ where: { transactionId: txn.id } })
    }
    throw err
  }
}

/** Remove the automatic award when a merchant undoes a confirmation. */
export async function reverseLoyaltyPointsForTransaction(transactionId: string) {
  const result = await prisma.loyaltyPoint.deleteMany({ where: { transactionId } })
  return result.count
}

export async function loyaltyBalance(merchantId: string, customerId: string): Promise<number> {
  const total = await prisma.loyaltyPoint.aggregate({
    where: { merchantId, customerId },
    _sum: { points: true },
  })
  return total._sum.points ?? 0
}

export type LoyaltyEntryView = {
  id: string
  points: number
  reason: string
  transactionId: string | null
  createdAt: Date
  customer?: { id: string; fullName: string; phone: string | null; email: string | null } | null
}

export function serializeLoyaltyEntry(entry: LoyaltyEntryView) {
  return {
    id: entry.id,
    points: entry.points,
    reason: entry.reason,
    transaction_id: entry.transactionId,
    created_at: entry.createdAt.toISOString(),
    customer: entry.customer
      ? {
          id: entry.customer.id,
          full_name: entry.customer.fullName,
          phone: entry.customer.phone,
          email: entry.customer.email,
        }
      : null,
  }
}
