import { NextResponse } from 'next/server'
import { handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { initiateRefund } from '@/lib/refunds'

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  try {
    const session = await requireSession()
    const result = await initiateRefund({ merchantId: session.id, refundId: ctx.params.id, actorUserId: session.id })
    return NextResponse.json(result)
  } catch (err) {
    return handleError(err)
  }
}