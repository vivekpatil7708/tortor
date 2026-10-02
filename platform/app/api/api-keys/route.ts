import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { createApiKey } from '@/lib/api-key'
import { apiError } from '@/lib/api-response'
import { EMAIL_NOT_VERIFIED } from '@/lib/email-verification'

/** List API keys for the merchant (secret hashes never leak). */
export async function GET() {
  try {
    const session = await requireMerchant()
    const keys = await prisma.apiKey.findMany({
      where: { merchantId: session.id },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(
      keys.map(k => ({
        id: k.id,
        name: k.name,
        key_prefix: k.keyPrefix,
        mode: k.mode,
        scopes: JSON.parse(k.scopes),
        expires_at: k.expiresAt?.toISOString() ?? null,
        last_used_at: k.lastUsedAt?.toISOString() ?? null,
        revoked_at: k.revokedAt?.toISOString() ?? null,
        created_at: k.createdAt.toISOString(),
      }))
    )
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

/**
 * Create an API key. The full secret is returned exactly once.
 * `publishable` keys are safe to use in browser contexts (no write access).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireMerchant()
    if (!session.emailVerifiedAt) return apiError(403, EMAIL_NOT_VERIFIED)
    const body = (await req.json().catch(() => ({}))) as { name?: string; mode?: string; scope?: string }

    const mode = body.mode === 'live' ? 'live' : 'test'
    const scope = body.scope === 'publishable' ? 'publishable' : 'secret'

    const { key, rawKey } = await createApiKey({
      merchantId: session.id,
      name: body.name?.trim().slice(0, 100) || 'Default',
      mode,
      scope,
    })

    return NextResponse.json({ key: rawKey, prefix: key.keyPrefix, mode, scope }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create API key'
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}