import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { apiError, notFound, publicErrorMessage } from '@/lib/api-response'
import { generateWebhookSecret } from '@/lib/webhook-delivery'

/**
 * Replace an endpoint's signing secret.
 *
 * Needed when a secret leaks (pasted into a chat, committed, shared with the
 * wrong person). The new secret is returned exactly once, like on create.
 * Deliveries signed with the old secret will fail verification afterwards, so
 * the endpoint's receiver must be updated with the new one.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireMerchant()
    const { id } = await ctx.params

    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: { id, merchantId: session.id },
      select: { id: true, url: true },
    })
    if (!endpoint) return notFound('Webhook endpoint not found')

    const secret = generateWebhookSecret()
    await prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: { secretEncrypted: secret },
    })

    return NextResponse.json({
      id: endpoint.id,
      url: endpoint.url,
      secret,
      message: 'Signing secret replaced. Update your receiver, requests are signed with the new secret from now on.',
    })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Failed to rotate the signing secret')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}
