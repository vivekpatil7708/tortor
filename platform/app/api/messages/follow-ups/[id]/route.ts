import { NextRequest, NextResponse } from 'next/server'
import { handleError, notFound } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { updateFollowUpTask } from '@/lib/follow-ups'

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const session = await requireSession()
    const body = await req.json()
    const task = await updateFollowUpTask(session.id, ctx.params.id, {
      status: body.status,
      assignedUserId: body.assignedUserId,
      notes: body.notes,
    })
    if (!task) return notFound('Follow-up task not found')
    return NextResponse.json({ task })
  } catch (err) {
    return handleError(err)
  }
}