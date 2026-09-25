import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getInventorySettings, updateInventorySettings } from '@/lib/inventory'

export async function GET() {
  try {
    const session = await requireSession()
    return NextResponse.json({ settings: await getInventorySettings(session.id) })
  } catch (err) {
    return handleError(err, 'Unauthorized')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireSession()
    const body = await req.json()
    const settings = await updateInventorySettings(session.id, {
      inventoryMode: body.inventoryMode,
      restoreStockOnCancelled: body.restoreStockOnCancelled,
      restoreStockOnReturn: body.restoreStockOnReturn,
      allowOverselling: body.allowOverselling,
    })
    return NextResponse.json({ settings })
  } catch (err) {
    return handleError(err)
  }
}