import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-response'
import { adminErrorResponse } from '@/lib/admin-api'
import { adminPage, readAdminListQuery } from '@/lib/admin-query'
import { firstInputProblem, templateProblem } from '@/lib/campaign-schema'
import { audienceSchema } from '@/lib/broadcast-audience'
import { dispatchCampaign } from '@/lib/broadcast-campaign'
import { emailProviderProblem } from '@/lib/broadcast-sender'
import { isRateLimited } from '@/lib/rate-limit'
import { recordAdminAction } from '@/lib/admin-audit'

/** The states a message can be in. */
const LOG_STATUSES = ['pending', 'sent', 'delivered', 'read', 'failed'] as const

const quickSendSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  ctaLabel: z.string().trim().max(80).optional(),
  audience: audienceSchema.optional(),
  /** Merchants picked by hand. They are added to whoever the filters match. */
  merchantIds: z.array(z.string().trim().min(1)).max(5000).optional(),
})

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    const params = req.nextUrl.searchParams
    const query = readAdminListQuery(params, {
      statuses: LOG_STATUSES,
      dateField: 'createdAt',
      search: (term) => ({
        OR: [
          { recipient: { contains: term, mode: 'insensitive' } },
          { subject: { contains: term, mode: 'insensitive' } },
        ],
      }),
    })
    if ('error' in query) return apiError(400, query.error)

    // Only the admin's own messages. A merchant's payment receipt is not a
    // broadcast and must never show up in this list.
    const filters: Record<string, unknown> = {
      ...query.filters,
      OR: [{ campaignId: { not: null } }, { createdBy: 'admin' }],
    }

    const rows = await prisma.messageLog.findMany({
      where: filters,
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        merchant: { select: { businessName: true, email: true } },
        campaign: { select: { id: true, name: true } },
        _count: { select: { openEvents: true } },
      },
    })

    const { page, nextCursor } = adminPage(rows, query.limit)

    return NextResponse.json({
      logs: page.map(log => ({
        id: log.id,
        merchant_name: log.merchant?.businessName || log.merchant?.email || 'Unknown',
        email: log.recipient,
        status: log.status,
        subject: log.subject,
        campaign_id: log.campaignId,
        campaign_name: log.campaign?.name ?? null,
        created_at: log.createdAt.toISOString(),
        sent_at: log.sentAt?.toISOString() ?? null,
        delivered_at: log.deliveredAt?.toISOString() ?? null,
        read_at: log.readAt?.toISOString() ?? null,
        open_count: log._count.openEvents,
      })),
      next_cursor: nextCursor,
    })
  } catch (err: unknown) {
    return adminErrorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin()

    const raw = await req.json().catch(() => null)
    const parsed = quickSendSchema.safeParse(raw)
    if (!parsed.success) return apiError(400, firstInputProblem(parsed.error))

    const problem = templateProblem(parsed.data.subject, parsed.data.body)
    if (problem) return apiError(400, problem)

    const providerProblem = emailProviderProblem()
    if (providerProblem) return apiError(503, providerProblem)

    if (await isRateLimited(req, 'admin_campaign_sent', 20, 60)) {
      return apiError(429, 'Too many broadcasts have been sent in the last hour. Try again later.')
    }

    const audience = {
      ...(parsed.data.audience ?? {}),
      ...(parsed.data.merchantIds?.length ? { merchantIds: parsed.data.merchantIds } : {}),
    }

    const campaign = await prisma.broadcastCampaign.create({
      data: {
        name: parsed.data.name || parsed.data.subject,
        subject: parsed.data.subject,
        body: parsed.data.body,
        ctaLabel: parsed.data.ctaLabel || null,
        audience: JSON.stringify(audience),
        createdBy: session.email,
        status: 'draft',
      },
    })

    const result = await dispatchCampaign(campaign.id)

    await recordAdminAction(session, 'admin_campaign_sent', 'broadcast_campaign', campaign.id, {
      total: result.total,
      sent: result.sent,
      failed: result.failed,
      remaining: result.remaining,
    })

    return NextResponse.json({
      success: true,
      campaign_id: campaign.id,
      total: result.total,
      sent: result.sent,
      failed: result.failed,
      remaining: result.remaining,
    })
  } catch (err: unknown) {
    return adminErrorResponse(err)
  }
}
