import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeLink } from '@/lib/serializers'
import { isValidRedirectUrl } from '@/lib/validate-url'
import { isValidWebhookUrl } from '@/lib/safe-fetch'
import { handleError, publicErrorMessage } from '@/lib/api-response'
import { linkUses } from '@/lib/link-uses'
import { linkAmountInput } from '@/lib/money'

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireSession()
    const link = await prisma.paymentLink.findFirst({
      where: { id: params.id, merchantId: session.id },
    })
    if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    // What counts against a use limit: paid payments, and ones still in progress.
    const { paid, inProgress } = await linkUses(prisma, link.id)
    return NextResponse.json({ ...serializeLink(link), paid_count: paid, in_progress_count: inProgress })
  } catch (err) {
    return handleError(err, 'Could not load the link')
  }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireSession()
    const body = await req.json()

    const existing = await prisma.paymentLink.findFirst({
      where: { id: params.id, merchantId: session.id },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (body.redirect_url !== undefined && body.redirect_url !== null && !isValidRedirectUrl(body.redirect_url)) {
      return NextResponse.json({ error: 'Invalid redirect URL' }, { status: 400 })
    }

    if (body.webhook_url !== undefined && body.webhook_url !== null && !isValidWebhookUrl(body.webhook_url)) {
      return NextResponse.json({ error: 'Invalid webhook URL' }, { status: 400 })
    }

    // A changed amount is kept to whole paise, like a new link's.
    const amount = body.amount != null ? linkAmountInput(body.amount) : null
    if (amount && !amount.ok) return NextResponse.json({ error: amount.error }, { status: 400 })

    const link = await prisma.paymentLink.update({
      where: { id: params.id },
      data: {
        title: body.title ?? existing.title,
        description: body.description ?? existing.description,
        status: body.status ?? existing.status,
        amount: amount?.ok ? amount.value : existing.amount,
        buttonText: body.button_text ?? existing.buttonText,
        webhookUrl: body.webhook_url ?? existing.webhookUrl,
        redirectUrl: body.redirect_url ?? existing.redirectUrl,
      },
    })

    return NextResponse.json({ success: true, link: serializeLink(link) })
  } catch (err: unknown) {
    const msg = publicErrorMessage(err, 'Update failed')
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireSession()
    const result = await prisma.paymentLink.deleteMany({
      where: { id: params.id, merchantId: session.id },
    })
    if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
