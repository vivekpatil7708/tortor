import { NextRequest, NextResponse } from 'next/server'
import { handleError, badRequest, unauthorized } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getMessageTemplates, setMessageTemplate, validateMessageTemplate, getUsedVariables } from '@/lib/messaging/templates'
import { MESSAGE_EVENTS, type MessagingChannel } from '@/lib/messaging/events'

export async function GET() {
  try {
    const session = await requireSession()
    const templates = await getMessageTemplates(session.id)
    return NextResponse.json({ templates, event_types: MESSAGE_EVENTS })
  } catch {
    return unauthorized()
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    const body = await req.json()
    const { channel, eventType, subject, isActive } = body
    const content = String(body.body ?? '')

    if (!['whatsapp', 'instagram', 'email'].includes(channel)) return badRequest('Invalid channel')
    if (!eventType) return badRequest('eventType is required')
    if (!content.trim()) return badRequest('body is required')

    const validation = validateMessageTemplate(content)
    if (!validation.valid) {
      return badRequest(`Template uses unsupported variables: ${validation.usedVars.join(', ')}`)
    }

    const template = await setMessageTemplate({
      merchantId: session.id,
      channel: channel as MessagingChannel,
      eventType,
      subject: String(subject ?? ''),
      body: content,
      isActive: isActive !== false,
    })
    return NextResponse.json({ template, used_vars: getUsedVariables(content) })
  } catch (err) {
    return handleError(err)
  }
}