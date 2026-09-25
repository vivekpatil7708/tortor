import { NextResponse } from 'next/server'
import { handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getInventoryLevels, getInventorySettings } from '@/lib/inventory'

export async function GET() {
  try {
    const session = await requireSession()
    const [levels, settings] = await Promise.all([getInventoryLevels(session.id), getInventorySettings(session.id)])
    return NextResponse.json({ levels, settings })
  } catch (err) {
    return handleError(err, 'Unauthorized')
  }
}