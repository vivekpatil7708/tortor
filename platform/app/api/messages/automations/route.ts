import { NextRequest, NextResponse } from 'next/server'
import { handleError, badRequest } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getAutomationRules, setAutomationRule } from '@/lib/messaging/automations'

export async function GET() {
  try {
    const session = await requireSession()
    const rules = await getAutomationRules(session.id)
    return NextResponse.json({ rules })
  } catch (err) {
    return handleError(err, 'Unauthorized')
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    const body = await req.json()
    const { eventType, channel, enabled, delayMinutes } = body
    if (!eventType || !channel) return badRequest('eventType and channel are required')

    const updated = await setAutomationRule({
      merchantId: session.id,
      eventType,
      channel,
      enabled: typeof enabled === 'boolean' ? enabled : undefined,
      delayMinutes: typeof delayMinutes === 'number' ? delayMinutes : undefined,
    })
    return NextResponse.json({ rule: updated })
  } catch (err) {
    return handleError(err)
  }
}