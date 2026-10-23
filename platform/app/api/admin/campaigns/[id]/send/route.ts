import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-response'
import { adminErrorResponse } from '@/lib/admin-api'
import { isRateLimited } from '@/lib/rate-limit'
import { dispatchCampaign } from '@/lib/broadcast-campaign'
import { emailProviderProblem, whatsappProviderProblem } from '@/lib/broadcast-sender'
import { recordAdminAction } from '@/lib/admin-audit'

export const maxDuration = 60

// A campaign can only be sent a few times a minute, so a mistake cannot
// flood every merchant with the same message.
const MAX_SENDS_PER_HOUR = 20

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin()
    const { id } = await params

    const campaign = await prisma.broadcastCampaign.findUnique({ where: { id } })
    if (!campaign) return apiError(404, 'Campaign not found')

    const providerProblem =
      campaign.channel === 'whatsapp' ? whatsappProviderProblem() : emailProviderProblem()
    if (providerProblem) return apiError(503, providerProblem)

    if (await isRateLimited(req, 'admin_campaign_sent', MAX_SENDS_PER_HOUR, 60)) {
      return apiError(429, 'Too many campaigns have been sent in the last hour. Try again later.')
    }

    const result = await dispatchCampaign(id)

    await recordAdminAction(session, 'admin_campaign_sent', 'broadcast_campaign', id, {
      total: result.total,
      sent: result.sent,
      failed: result.failed,
      remaining: result.remaining,
      suppressed: result.suppressed,
    })

    return NextResponse.json({
      success: true,
      campaign_id: result.campaignId,
      total: result.total,
      sent: result.sent,
      failed: result.failed,
      remaining: result.remaining,
      suppressed: result.suppressed,
    })
  } catch (err: unknown) {
    return adminErrorResponse(err)
  }
}
