import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { sendTestEmail } from '@/lib/emails/service'
import { EMAIL_AUTOMATION_LABELS } from '@/lib/emails/templates'
import { apiError, badRequest } from '@/lib/api-response'

export async function POST(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const body = (await req.json().catch(() => null)) as { key?: string; to?: string } | null

    if (!body?.key || !(body.key in EMAIL_AUTOMATION_LABELS)) return badRequest('A valid email type is required')
    if (!body.to) return badRequest('A recipient email is required')

    const result = await sendTestEmail(session.id, body.key as never, body.to)
    return NextResponse.json({ success: result.status === 'sent', status: result.status })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to send test email'
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}