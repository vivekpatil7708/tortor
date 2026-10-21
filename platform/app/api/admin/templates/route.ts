import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-response'
import { adminErrorResponse } from '@/lib/admin-api'
import { adminPage, readAdminListQuery } from '@/lib/admin-query'
import { CHANNELS, firstInputProblem, templateInputSchema, templateProblem } from '@/lib/campaign-schema'
import { recordAdminAction } from '@/lib/admin-audit'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    const query = readAdminListQuery(req.nextUrl.searchParams, {
      dateField: 'updatedAt',
      search: (term) => ({
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { subject: { contains: term, mode: 'insensitive' } },
        ],
      }),
    })
    if ('error' in query) return apiError(400, query.error)

    const filters: Record<string, unknown> = { ...query.filters, merchantId: null }

    const channel = req.nextUrl.searchParams.get('channel')
    if (channel) {
      if (!(CHANNELS as readonly string[]).includes(channel)) return apiError(400, 'Unknown channel')
      filters.channel = channel
    }

    const rows = await prisma.messageTemplate.findMany({
      where: filters,
      orderBy: { updatedAt: 'desc' },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    })

    const { page, nextCursor } = adminPage(rows, query.limit)

    return NextResponse.json({
      templates: page.map(template => ({
        id: template.id,
        name: template.name,
        channel: template.channel,
        subject: template.subject,
        body: template.body,
        language_code: template.languageCode,
        event_type: template.eventType,
        is_active: template.isActive,
        updated_at: template.updatedAt.toISOString(),
      })),
      next_cursor: nextCursor,
    })
  } catch (err: unknown) {
    return adminErrorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin()

    const raw = await req.json().catch(() => null)
    const parsed = templateInputSchema.safeParse(raw)
    if (!parsed.success) return apiError(400, firstInputProblem(parsed.error))

    const problem = templateProblem(parsed.data.subject, parsed.data.body)
    if (problem) return apiError(400, problem)

    // A merchant can make a template with the same name, so only the admin's
    // own templates are checked for a clash.
    const existing = await prisma.messageTemplate.findFirst({
      where: { merchantId: null, channel: parsed.data.channel, name: parsed.data.name },
      select: { id: true },
    })
    if (existing) return apiError(400, 'A template with that name already exists')

    const template = await prisma.messageTemplate.create({
      data: {
        merchantId: null,
        channel: parsed.data.channel,
        name: parsed.data.name,
        subject: parsed.data.subject,
        body: parsed.data.body,
        languageCode: parsed.data.languageCode,
        eventType: parsed.data.eventType || null,
      },
    })

    await recordAdminAction(session, 'admin_template_created', 'message_template', template.id, {
      name: template.name,
    })

    return NextResponse.json(
      {
        template: {
          id: template.id,
          name: template.name,
          channel: template.channel,
          subject: template.subject,
          body: template.body,
          language_code: template.languageCode,
          event_type: template.eventType,
          is_active: template.isActive,
        },
      },
      { status: 201 }
    )
  } catch (err: unknown) {
    return adminErrorResponse(err)
  }
}
