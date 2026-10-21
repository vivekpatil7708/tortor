import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { ensureFeedbackTable } from '@/lib/feedback-schema'
import { apiError } from '@/lib/api-response'
import { adminErrorResponse } from '@/lib/admin-api'
import { adminPage, readAdminListQuery } from '@/lib/admin-query'
import { FEEDBACK_STATUSES, safeUsefulParts } from '@/lib/feedback'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()
    await ensureFeedbackTable()

    const params = req.nextUrl.searchParams
    const query = readAdminListQuery(params, {
      statuses: FEEDBACK_STATUSES,
      dateField: 'createdAt',
      search: (term) => ({
        OR: [
          { merchantName: { contains: term, mode: 'insensitive' } },
          { contact: { contains: term, mode: 'insensitive' } },
          { issues: { contains: term, mode: 'insensitive' } },
          { improvement: { contains: term, mode: 'insensitive' } },
        ],
      }),
    })
    if ('error' in query) return apiError(400, query.error)

    const filters: Record<string, unknown> = { ...query.filters }

    const campaignId = params.get('campaign_id')
    if (campaignId) filters.campaignId = campaignId

    const merchantId = params.get('merchant_id')
    if (merchantId) filters.merchantId = merchantId

    const rows = await prisma.feedbackResponse.findMany({
      where: filters,
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        merchant: { select: { id: true, businessName: true, email: true } },
        campaign: { select: { id: true, name: true } },
      },
    })

    const { page, nextCursor } = adminPage(rows, query.limit)

    // The summary covers every response, not just the page on screen.
    const [total, satisfaction, ease, followUps, npsBuckets] = await Promise.all([
      prisma.feedbackResponse.count(),
      prisma.feedbackResponse.aggregate({ _avg: { satisfaction: true } }),
      prisma.feedbackResponse.aggregate({ _avg: { easeOfUse: true } }),
      prisma.feedbackResponse.count({ where: { followUp: true } }),
      prisma.feedbackResponse.groupBy({ by: ['npsScore'], _count: { _all: true } }),
    ])

    let promoters = 0
    let passives = 0
    let detractors = 0
    for (const bucket of npsBuckets) {
      const count = bucket._count._all
      if (bucket.npsScore >= 9) promoters += count
      else if (bucket.npsScore >= 7) passives += count
      else detractors += count
    }

    return NextResponse.json({
      summary: {
        total,
        nps: total === 0 ? 0 : Math.round(((promoters - detractors) / total) * 100),
        promoters,
        passives,
        detractors,
        avg_satisfaction: satisfaction._avg.satisfaction
          ? Number(satisfaction._avg.satisfaction.toFixed(1))
          : 0,
        avg_ease_of_use: ease._avg.easeOfUse ? Number(ease._avg.easeOfUse.toFixed(1)) : 0,
        follow_ups: followUps,
      },
      responses: page.map(r => ({
        id: r.id,
        merchant_name: r.merchantName,
        merchant_id: r.merchantId,
        merchant_email: r.merchant?.email ?? null,
        campaign_id: r.campaignId,
        campaign_name: r.campaign?.name ?? null,
        satisfaction: r.satisfaction,
        ease_of_use: r.easeOfUse,
        useful_parts: safeUsefulParts(r.usefulParts),
        ease_collecting: r.easeCollecting,
        likes_most: r.likesMost,
        issues: r.issues,
        improvement: r.improvement,
        nps_score: r.npsScore,
        follow_up: r.followUp,
        contact: r.contact,
        status: r.status,
        admin_note: r.adminNote,
        reviewed_at: r.reviewedAt?.toISOString() ?? null,
        created_at: r.createdAt.toISOString(),
      })),
      next_cursor: nextCursor,
    })
  } catch (err: unknown) {
    return adminErrorResponse(err)
  }
}
