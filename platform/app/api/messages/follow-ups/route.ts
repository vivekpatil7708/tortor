import { NextRequest, NextResponse } from 'next/server'
import { handleError, badRequest } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { listFollowUpTasks, suggestFollowUps, createFollowUpFromSuggestion } from '@/lib/follow-ups'

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession()
    const sp = req.nextUrl.searchParams
    const status = sp.get('status')
    const category = sp.get('category')
    const from = sp.get('from') ? new Date(sp.get('from')!) : null
    const to = sp.get('to') ? new Date(sp.get('to')!) : null
    const tasks = await listFollowUpTasks(session.id, { status, category, from, to })
    const suggestions = await suggestFollowUps(session.id)
    return NextResponse.json({ tasks, suggestions })
  } catch (err) {
    return handleError(err, 'Unauthorized')
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    const body = await req.json()
    if (body.fromSuggestion) {
      const suggestion = body.suggestion
      if (!suggestion || !suggestion.category) return badRequest('A valid suggestion payload is required')
      const result = await createFollowUpFromSuggestion(session.id, {
        category: suggestion.category,
        title: suggestion.title ?? '',
        customerId: suggestion.customerId ?? null,
        orderId: suggestion.orderId ?? null,
        orderNumber: suggestion.orderNumber ?? null,
        reference: suggestion.reference ?? null,
        detail: suggestion.detail ?? '',
        dueAt: suggestion.dueAt ? new Date(suggestion.dueAt) : new Date(),
      })
      return NextResponse.json({ result })
    }
    return badRequest('Provide a follow-up suggestion payload')
  } catch (err) {
    return handleError(err)
  }
}