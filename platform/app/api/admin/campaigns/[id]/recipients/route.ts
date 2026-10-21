import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-response'
import { adminErrorResponse } from '@/lib/admin-api'
import { resolveCampaignRecipients } from '@/lib/broadcast-campaign'

/** How many recipients are listed at a time. */
const PAGE_SIZE = 100

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params

    const campaign = await prisma.broadcastCampaign.findUnique({ where: { id }, select: { id: true } })
    if (!campaign) return apiError(404, 'Campaign not found')

    const { recipients, matched, suppressed, tooMany } = await resolveCampaignRecipients(id)

    const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset')) || 0)
    const page = recipients.slice(offset, offset + PAGE_SIZE)

    // What happened to each recipient, so the list shows the state of the send.
    const logs = await prisma.messageLog.findMany({
      where: { campaignId: id },
      select: { merchantId: true, status: true, sentAt: true, deliveredAt: true, readAt: true, errorMessage: true },
    })
    const byMerchant = new Map(logs.map(log => [log.merchantId, log]))

    return NextResponse.json({
      total: matched - suppressed,
      matched,
      suppressed,
      too_many: tooMany,
      offset,
      recipients: page.map(recipient => {
        const log = byMerchant.get(recipient.id)
        return {
          id: recipient.id,
          email: recipient.email,
          business_name: recipient.businessName || recipient.email,
          status: log?.status ?? 'pending',
          sent_at: log?.sentAt?.toISOString() ?? null,
          delivered_at: log?.deliveredAt?.toISOString() ?? null,
          read_at: log?.readAt?.toISOString() ?? null,
          error: log?.errorMessage ?? null,
        }
      }),
    })
  } catch (err: unknown) {
    return adminErrorResponse(err)
  }
}
