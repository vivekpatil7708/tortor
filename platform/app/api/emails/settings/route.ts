import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { getEmailSettings, updateEmailSetting } from '@/lib/emails/service'
import { EMAIL_AUTOMATION_LABELS, SUPPORTED_EMAIL_VARIABLES } from '@/lib/emails/templates'
import { apiError, badRequest } from '@/lib/api-response'

export async function GET() {
  try {
    const session = await requireMerchant()
    const settings = await getEmailSettings(session.id)
    return NextResponse.json({ settings, labels: EMAIL_AUTOMATION_LABELS, variables: [...SUPPORTED_EMAIL_VARIABLES] })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const body = (await req.json().catch(() => null)) as {
      key?: string
      subject?: string
      body?: string
      is_active?: boolean
    } | null

    if (!body?.key) return badRequest('email type key is required')
    if (!(body.key in EMAIL_AUTOMATION_LABELS)) return badRequest('Unknown email type')

    const setting = await updateEmailSetting({
      merchantId: session.id,
      key: body.key as never,
      subject: typeof body.subject === 'string' ? body.subject : undefined,
      body: typeof body.body === 'string' ? body.body : undefined,
      isActive: typeof body.is_active === 'boolean' ? body.is_active : undefined,
    })

    return NextResponse.json({ success: true, setting })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update email settings'
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}