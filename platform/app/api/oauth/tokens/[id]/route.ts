import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { revokeConnectedApp } from '@/lib/oauth'
import { apiError, notFound, publicErrorMessage } from '@/lib/api-response'

/**
 * DELETE /api/oauth/tokens/{id} — disconnect an app: revokes the access token
 * so its AI client loses access immediately. Merchant-scoped: another
 * merchant's token is a 404.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireMerchant()
    const ok = await revokeConnectedApp((await ctx.params).id, session.id)
    if (!ok) return notFound('Connected app not found')
    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Failed to revoke access')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}
