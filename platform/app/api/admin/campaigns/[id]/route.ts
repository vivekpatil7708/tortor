import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-response'
import { adminErrorResponse } from '@/lib/admin-api'
import { campaignInputSchema, firstInputProblem, templateProblem } from '@/lib/campaign-schema'
import { audienceOf, describeAudience } from '@/lib/broadcast-audience'
import { recordAdminAction } from '@/lib/admin-audit'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireAdmin()
    const { id } = await params

    const campaign = await prisma.broadcastCampaign.findUnique({
      where: { id },
      include: {
        _count: { select: { logs: true, feedback: true } },
      },
    })
    if (!campaign) return apiError(404, 'Campaign not found')

    const [sent, failed, pending] = await Promise.all([
      prisma.messageLog.count({ where: { campaignId: id, status: 'sent' } }),
      prisma.messageLog.count({ where: { campaignId: id, status: 'failed' } }),
      prisma.messageLog.count({ where: { campaignId: id, status: 'pending' } }),
    ])

    return NextResponse.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        subject: campaign.subject,
        body: campaign.body,
        cta_label: campaign.ctaLabel,
        status: campaign.status,
        audience: audienceOf(campaign),
        audience_summary: describeAudience(audienceOf(campaign)),
        total_count: campaign.totalCount,
        sent_count: sent,
        failed_count: failed,
        pending_count: pending,
        feedback_count: campaign._count.feedback,
        created_at: campaign.createdAt.toISOString(),
        sent_at: campaign.sentAt?.toISOString() ?? null,
      },
    })
  } catch (err: unknown) {
    return adminErrorResponse(err)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await requireAdmin()
    const { id } = await params

    const campaign = await prisma.broadcastCampaign.findUnique({ where: { id } })
    if (!campaign) return apiError(404, 'Campaign not found')
    if (campaign.status === 'sent') return apiError(400, 'A campaign that has been sent cannot be changed')

    const raw = await req.json().catch(() => null)
    const parsed = campaignInputSchema.safeParse(raw)
    if (!parsed.success) return apiError(400, firstInputProblem(parsed.error))

    const problem = templateProblem(parsed.data.subject, parsed.data.body)
    if (problem) return apiError(400, problem)

    const updated = await prisma.broadcastCampaign.update({
      where: { id },
      data: {
        name: parsed.data.name,
        subject: parsed.data.subject,
        body: parsed.data.body,
        ctaLabel: parsed.data.ctaLabel || null,
        audience: JSON.stringify(parsed.data.audience),
      },
    })

    await recordAdminAction(session, 'admin_campaign_updated', 'broadcast_campaign', id)

    return NextResponse.json({
      campaign: {
        id: updated.id,
        name: updated.name,
        subject: updated.subject,
        body: updated.body,
        cta_label: updated.ctaLabel,
        status: updated.status,
        audience: audienceOf(updated),
        created_at: updated.createdAt.toISOString(),
      },
    })
  } catch (err: unknown) {
    return adminErrorResponse(err)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireAdmin()
    const { id } = await params

    const campaign = await prisma.broadcastCampaign.findUnique({
      where: { id },
      include: { _count: { select: { logs: true } } },
    })
    if (!campaign) return apiError(404, 'Campaign not found')
    if (campaign._count.logs > 0) return apiError(400, 'A campaign that has already been sent cannot be deleted')

    await prisma.broadcastCampaign.delete({ where: { id } })
    await recordAdminAction(session, 'admin_campaign_deleted', 'broadcast_campaign', id, { name: campaign.name })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return adminErrorResponse(err)
  }
}
