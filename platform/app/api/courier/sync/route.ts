import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant, getOwnerUser } from '@/lib/tenant'
import { syncActiveShipments } from '@/lib/couriers/sync'
import { handleError } from '@/lib/api-response'

// POST /api/courier/sync — run the courier reconciliation job for this merchant
export async function POST(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const owner = await getOwnerUser(session.id)
    const body = await req.json().catch(() => ({}))
    const limit = typeof body.limit === 'number' ? body.limit : 100

    const result = await syncActiveShipments({ merchantId: session.id, limit })

    // Log for auditing so reconciliation runs are traceable.
    const { logAudit } = await import('@/lib/audit')
    await logAudit({
      merchantId: session.id,
      actorUserId: owner?.id ?? null,
      action: 'courier_sync_run',
      entityType: 'merchant',
      entityId: session.id,
      metadata: { scanned: result.scanned, synced: result.synced, errors: result.errors },
    })

    return NextResponse.json(result)
  } catch (err) {
    return handleError(err)
  }
}