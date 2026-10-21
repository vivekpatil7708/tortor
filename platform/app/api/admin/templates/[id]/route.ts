import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-response'
import { adminErrorResponse } from '@/lib/admin-api'
import { firstInputProblem, templateInputSchema, templateProblem } from '@/lib/campaign-schema'
import { recordAdminAction } from '@/lib/admin-audit'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireAdmin()
    const { id } = await params

    const template = await prisma.messageTemplate.findFirst({
      where: { id, merchantId: null },
    })
    if (!template) return apiError(404, 'Template not found')

    return NextResponse.json({
      template: {
        id: template.id,
        name: template.name,
        channel: template.channel,
        subject: template.subject,
        body: template.body,
        language_code: template.languageCode,
        event_type: template.eventType,
        is_active: template.isActive,
        updated_at: template.updatedAt.toISOString(),
      },
    })
  } catch (err: unknown) {
    return adminErrorResponse(err)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await requireAdmin()
    const { id } = await params

    const template = await prisma.messageTemplate.findFirst({ where: { id, merchantId: null } })
    if (!template) return apiError(404, 'Template not found')

    const raw = await req.json().catch(() => null)
    const parsed = templateInputSchema.safeParse(raw)
    if (!parsed.success) return apiError(400, firstInputProblem(parsed.error))

    const problem = templateProblem(parsed.data.subject, parsed.data.body)
    if (problem) return apiError(400, problem)

    const clash = await prisma.messageTemplate.findFirst({
      where: { id: { not: id }, merchantId: null, channel: parsed.data.channel, name: parsed.data.name },
      select: { id: true },
    })
    if (clash) return apiError(400, 'A template with that name already exists')

    const updated = await prisma.messageTemplate.update({
      where: { id },
      data: {
        name: parsed.data.name,
        channel: parsed.data.channel,
        subject: parsed.data.subject,
        body: parsed.data.body,
        languageCode: parsed.data.languageCode,
        eventType: parsed.data.eventType || null,
      },
    })

    await recordAdminAction(session, 'admin_template_updated', 'message_template', id, { name: updated.name })

    return NextResponse.json({
      template: {
        id: updated.id,
        name: updated.name,
        channel: updated.channel,
        subject: updated.subject,
        body: updated.body,
        language_code: updated.languageCode,
        event_type: updated.eventType,
        is_active: updated.isActive,
      },
    })
  } catch (err: unknown) {
    return adminErrorResponse(err)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireAdmin()
    const { id } = await params

    const template = await prisma.messageTemplate.findFirst({ where: { id, merchantId: null } })
    if (!template) return apiError(404, 'Template not found')

    await prisma.messageTemplate.delete({ where: { id } })
    await recordAdminAction(session, 'admin_template_deleted', 'message_template', id, { name: template.name })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return adminErrorResponse(err)
  }
}
