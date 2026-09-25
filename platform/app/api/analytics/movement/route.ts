import { NextResponse } from 'next/server'
import { handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { runMovement } from '@/lib/analytics/engine'

export async function GET() {
  try {
    const session = await requireSession()
    return NextResponse.json(await runMovement({ merchantId: session.id }))
  } catch (err) {
    return handleError(err, 'Unauthorized')
  }
}