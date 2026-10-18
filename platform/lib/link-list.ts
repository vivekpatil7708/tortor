import { prisma } from '@/lib/prisma'
import { serializeLink } from '@/lib/serializers'

// Listing a merchant's payment links with what each has brought in, shared by
// the dashboard route (app/api/links GET) and the public v1 API
// (app/api/v1/links GET). Totals are counted in the database in one go.

export async function listLinksWithTotals(merchantId: string) {
  const [links, paid] = await Promise.all([
    prisma.paymentLink.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
    }),
    // What each link has brought in, counted in the database in one go.
    prisma.transaction.groupBy({
      by: ['paymentLinkId'],
      where: { merchantId, status: 'success', paymentLinkId: { not: null } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ])
  const byLink = new Map(paid.map(p => [p.paymentLinkId, p]))
  return links.map(link => {
    const totals = byLink.get(link.id)
    return {
      ...serializeLink(link),
      paid_count: totals?._count._all ?? 0,
      paid_total: Math.round((totals?._sum.amount ?? 0) * 100) / 100,
    }
  })
}
