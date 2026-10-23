import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-response'
import { adminErrorResponse } from '@/lib/admin-api'
import { adminPage, readAdminListQuery } from '@/lib/admin-query'
import { campaignInputSchema, firstInputProblem, templateProblem } from '@/lib/campaign-schema'
import { audienceOf, describeAudience } from '@/lib/broadcast-audience'
import { CAMPAIGN_STATUSES } from '@/lib/broadcast-campaign'
import { recordAdminAction } from '@/lib/admin-audit'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    const query = readAdminListQuery(req.nextUrl.searchParams, {
      statuses: CAMPAIGN_STATUSES,
      dateField: 'createdAt',
      search: (term) => ({
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { subject: { contains: term, mode: 'insensitive' } },
        ],
      }),
    })
    if ('error' in query) return apiError(400, query.error)

    const rows = await prisma.broadcastCampaign.findMany({
      where: query.filters,
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    })

    const { page, nextCursor } = adminPage(rows, query.limit)

    return NextResponse.json({
      campaigns: page.map(campaign => ({
        id: campaign.id,
        name: campaign.name,
        subject: campaign.subject,
        status: campaign.status,
        audience: describeAudience(audienceOf(campaign)),
        total_count: campaign.totalCount,
        sent_count: campaign.sentCount,
        failed_count: campaign.failedCount,
        created_at: campaign.createdAt.toISOString(),
        sent_at: campaign.sentAt?.toISOString() ?? null,
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
    const parsed = campaignInputSchema.safeParse(raw)
    if (!parsed.success) return apiError(400, firstInputProblem(parsed.error))

    if (parsed.data.channel === 'email') {
      const problem = templateProblem(parsed.data.subject, parsed.data.body)
      if (problem) return apiError(400, problem)
    } else if (!parsed.data.subject && !parsed.data.body.trim()) {
      return apiError(400, 'The message body is required')
    }

    const campaign = await prisma.broadcastCampaign.create({
      data: {
        name: parsed.data.name,
        subject: parsed.data.subject || '',
        body: parsed.data.body,
        ctaLabel: parsed.data.channel === 'email' ? (parsed.data.ctaLabel || null) : null,
        channel: parsed.data.channel,
        audience: JSON.stringify(parsed.data.audience),
        createdBy: session.email,
        status: 'draft',
      },
    })

    await recordAdminAction(session, 'admin_campaign_created', 'broadcast_campaign', campaign.id, {
      name: campaign.name,
    })

    return NextResponse.json(
      {
        campaign: {
          id: campaign.id,
          name: campaign.name,
          subject: campaign.subject,
          body: campaign.body,
          cta_label: campaign.ctaLabel,
          channel: campaign.channel,
          status: campaign.status,
          audience: campaign.audience,
          created_at: campaign.createdAt.toISOString(),
        },
      },
      { status: 201 }
    )
  } catch (err: unknown) {
    return adminErrorResponse(err)
  }
}
