import { NextRequest, NextResponse } from 'next/server'
import { handleError, badRequest } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { manualAdjustStock, getInventoryAdjustments } from '@/lib/inventory'

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession()
    const sp = req.nextUrl.searchParams
    const { adjustments, total, limit } = await getInventoryAdjustments(session.id, {
      productId: sp.get('productId'),
      from: sp.get('from') ? new Date(sp.get('from')!) : null,
      to: sp.get('to') ? new Date(sp.get('to')!) : null,
      limit: sp.get('limit') ? Number(sp.get('limit')) : undefined,
      offset: sp.get('offset') ? Number(sp.get('offset')) : undefined,
    })
    return NextResponse.json({ adjustments, total, limit })
  } catch (err) {
    return handleError(err, 'Unauthorized')
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    const body = await req.json()
    if (!body.productId || body.quantityChange === undefined) return badRequest('productId and quantityChange are required')

    const product = await manualAdjustStock({
      merchantId: session.id,
      productId: body.productId,
      quantityChange: Number(body.quantityChange),
      reason: body.reason ?? 'Manual adjustment',
      actorUserId: session.id,
    })
    return NextResponse.json({ product })
  } catch (err) {
    return handleError(err)
  }
}