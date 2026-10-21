import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-response'
import { adminErrorResponse } from '@/lib/admin-api'
import { adminPage, readAdminListQuery } from '@/lib/admin-query'

/** The states a message can be in. */
const LOG_STATUSES = ['pending', 'sent', 'delivered', 'read', 'failed'] as const
const CHANNELS = ['email', 'whatsapp', 'instagram'] as const

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

    const filters: Record<string, unknown> = { ...query.filters }

    const channel = params.get('channel')
    if (channel) {
      if (!(CHANNELS as readonly string[]).includes(channel)) return apiError(400, 'Unknown channel')
      filters.channel = channel
    }

    const campaignId = params.get('campaign_id')
    if (campaignId) filters.campaignId = campaignId

    // "Broadcasts only" shows the admin's own campaigns and leaves the
    // merchants' transactional messages out.
    if (params.get('broadcasts') === 'true') {
      filters.OR = [
        { campaignId: { not: null } },
        { createdBy: 'admin' },
      ]
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
        merchant_id: log.merchantId,
        recipient: log.recipient,
        channel: log.channel,
        subject: log.subject,
        status: log.status,
        provider: log.provider,
        error: log.errorMessage,
        campaign_id: log.campaignId,
        campaign_name: log.campaign?.name ?? null,
        open_count: log._count.openEvents,
        created_at: log.createdAt.toISOString(),
        sent_at: log.sentAt?.toISOString() ?? null,
        delivered_at: log.deliveredAt?.toISOString() ?? null,
        read_at: log.readAt?.toISOString() ?? null,
      })),
      next_cursor: nextCursor,
    })
  } catch (err: unknown) {
    return adminErrorResponse(err)
  }
}
