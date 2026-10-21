import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-response'
import { adminErrorResponse } from '@/lib/admin-api'
import { FEEDBACK_STATUSES } from '@/lib/feedback'
import { recordAdminAction } from '@/lib/admin-audit'

const updateSchema = z.object({
  status: z.enum(FEEDBACK_STATUSES).optional(),
  adminNote: z.string().trim().max(2000).nullable().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params

    const response = await prisma.feedbackResponse.findUnique({
      where: { id },
      include: {
        merchant: { select: { id: true, businessName: true, email: true, phone: true } },
        campaign: { select: { id: true, name: true, subject: true } },
      },
    })
    if (!response) return apiError(404, 'Feedback not found')

    return NextResponse.json({
      feedback: {
        id: response.id,
        merchant_name: response.merchantName,
        merchant_id: response.merchantId,
        merchant: response.merchant,
        campaign: response.campaign,
        satisfaction: response.satisfaction,
        ease_of_use: response.easeOfUse,
        ease_collecting: response.easeCollecting,
        likes_most: response.likesMost,
        issues: response.issues,
        improvement: response.improvement,
        nps_score: response.npsScore,
        follow_up: response.followUp,
        contact: response.contact,
        status: response.status,
        admin_note: response.adminNote,
        reviewed_at: response.reviewedAt?.toISOString() ?? null,
        created_at: response.createdAt.toISOString(),
      },
    })
  } catch (err: unknown) {
    return adminErrorResponse(err)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin()
    const { id } = await params

    const existing = await prisma.feedbackResponse.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return apiError(404, 'Feedback not found')

    const raw = await req.json().catch(() => null)
    const parsed = updateSchema.safeParse(raw)
    if (!parsed.success) return apiError(400, 'That change is not valid')

    const updated = await prisma.feedbackResponse.update({
      where: { id },
      data: {
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
        ...(parsed.data.adminNote !== undefined ? { adminNote: parsed.data.adminNote } : {}),
        reviewedAt: new Date(),
      },
    })

    await recordAdminAction(session, 'admin_feedback_updated', 'feedback_response', id, {
      status: updated.status,
    })

    return NextResponse.json({
      feedback: {
        id: updated.id,
        status: updated.status,
        admin_note: updated.adminNote,
        reviewed_at: updated.reviewedAt?.toISOString() ?? null,
      },
    })
  } catch (err: unknown) {
    return adminErrorResponse(err)
  }
}
