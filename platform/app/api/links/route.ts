import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { EMAIL_NOT_VERIFIED } from '@/lib/email-verification'
import { createPaymentLink } from '@/lib/payment-link-create'
import { listLinksWithTotals } from '@/lib/link-list'
import { serializeLink } from '@/lib/serializers'
import { handleError, publicErrorMessage } from '@/lib/api-response'

export async function GET() {
  try {
    const session = await requireSession()
    return NextResponse.json(await listLinksWithTotals(session.id))
  } catch (err) {
    return handleError(err, 'Could not load your links')
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    if (!session.emailVerifiedAt) {
      return NextResponse.json({ error: EMAIL_NOT_VERIFIED }, { status: 403 })
    }
    const body = await req.json()

    const result = await createPaymentLink(session.id, body)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

    return NextResponse.json({ success: true, link: serializeLink(result.link) })
  } catch (err: unknown) {
    const msg = publicErrorMessage(err, 'Failed to create link')
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}
