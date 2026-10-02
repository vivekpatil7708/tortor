import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { revokeApiKey, rotateApiKey } from '@/lib/api-key'
import { apiError, notFound } from '@/lib/api-response'

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const key = await prisma.apiKey.findFirst({ where: { id: ctx.params.id, merchantId: session.id } })
    if (!key) return notFound('API key not found')
    return NextResponse.json({
      id: key.id,
      name: key.name,
      key_prefix: key.keyPrefix,
      mode: key.mode,
      scopes: JSON.parse(key.scopes),
      expires_at: key.expiresAt?.toISOString() ?? null,
      last_used_at: key.lastUsedAt?.toISOString() ?? null,
      revoked_at: key.revokedAt?.toISOString() ?? null,
      created_at: key.createdAt.toISOString(),
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const body = (await req.json().catch(() => ({}))) as { action?: string }

    if (body.action === 'revoke') {
      const ok = await revokeApiKey(ctx.params.id, session.id)
      if (!ok) return notFound('API key not found')
      return NextResponse.json({ success: true, action: 'revoked' })
    }

    if (body.action === 'rotate') {
      const created = await rotateApiKey(ctx.params.id, session.id)
      if (!created) return notFound('API key not found')
      return NextResponse.json({ success: true, action: 'rotated', key: created.rawKey, prefix: created.key.keyPrefix })
    }

    return apiError(400, 'Invalid action')
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update API key'
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const ok = await revokeApiKey(ctx.params.id, session.id)
    if (!ok) return notFound('API key not found')
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}