import { NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { listConnectedApps } from '@/lib/oauth'

/**
 * GET /api/oauth/tokens — the apps a merchant has connected through OAuth
 * (the "Connected apps" section in Settings). Tokens are merchant-scoped, so a
 * session can only ever see its own.
 */
export async function GET() {
  try {
    const session = await requireMerchant()
    return NextResponse.json(await listConnectedApps(session.id))
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
