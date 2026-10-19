import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { apiError, notFound, publicErrorMessage } from '@/lib/api-response'

const MAX_MERGE = 50

/**
 * Fold one or more duplicate customers into a single surviving record.
 *
 * Nothing is deleted that holds history: the duplicates' orders, addresses,
 * messages, returns and follow-up tasks are re-pointed at the target first,
 * then the emptied duplicate rows are removed. Everything is scoped to the
 * signed-in merchant and the whole move runs in one transaction.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireMerchant()

    const body = (await req.json().catch(() => ({}))) as { targetId?: string; sourceIds?: unknown }
    const targetId = body.targetId?.trim()
    if (!targetId) return apiError(400, 'Pick the customer to keep')

    const sourceIds = Array.isArray(body.sourceIds)
      ? Array.from(new Set(body.sourceIds.filter((id): id is string => typeof id === 'string')))
          .map(id => id.trim())
          .filter(id => id.length > 0 && id !== targetId)
      : []
    if (!sourceIds.length) return apiError(400, 'Pick at least one duplicate to merge away')
    if (sourceIds.length > MAX_MERGE) return apiError(400, `Merge at most ${MAX_MERGE} customers at a time`)

    // Every id must belong to this merchant, including the one we keep.
    const target = await prisma.customer.findFirst({
      where: { id: targetId, merchantId: session.id },
      select: { id: true },
    })
    if (!target) return notFound('Customer to keep was not found')

    const owned = await prisma.customer.findMany({
      where: { id: { in: sourceIds }, merchantId: session.id },
      select: { id: true },
    })
    if (owned.length !== sourceIds.length) return notFound('One or more customers to merge were not found')

    const ids = owned.map(c => c.id)

    await prisma.$transaction(async tx => {
      // Move everything that points at a duplicate over to the survivor.
      const moves = [
        tx.order.updateMany({ where: { customerId: { in: ids }, merchantId: session.id }, data: { customerId: targetId } }),
        tx.customerAddress.updateMany({ where: { customerId: { in: ids }, merchantId: session.id }, data: { customerId: targetId } }),
        tx.messageLog.updateMany({ where: { customerId: { in: ids }, merchantId: session.id }, data: { customerId: targetId } }),
        tx.returnRequest.updateMany({ where: { customerId: { in: ids }, merchantId: session.id }, data: { customerId: targetId } }),
        tx.followUpTask.updateMany({ where: { customerId: { in: ids }, merchantId: session.id }, data: { customerId: targetId } }),
      ]
      await Promise.all(moves)

      // The duplicates should now own nothing, so removing them is safe.
      await tx.customer.deleteMany({ where: { id: { in: ids }, merchantId: session.id } })

      // Counters are recomputed from the orders that now belong to the survivor.
      const stats = await tx.order.aggregate({
        where: { merchantId: session.id, customerId: targetId, orderStatus: { not: 'cancelled' } },
        _count: { id: true },
        _sum: { totalAmount: true },
        _max: { createdAt: true },
      })
      await tx.customer.update({
        where: { id: targetId },
        data: {
          totalOrders: stats._count.id,
          totalSpent: stats._sum.totalAmount?.toNumber() ?? 0,
          lastOrderAt: stats._max.createdAt,
        },
      })
    })

    return NextResponse.json({ success: true, merged: ids.length, kept: targetId })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Failed to merge customers')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}
