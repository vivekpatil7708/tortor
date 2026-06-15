import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeLink } from '@/lib/serializers'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession()
    const link = await prisma.paymentLink.findFirst({
      where: { id: params.id, merchantId: session.id },
    })
    if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(serializeLink(link))
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession()
    const body = await req.json()

    const existing = await prisma.paymentLink.findFirst({
      where: { id: params.id, merchantId: session.id },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const link = await prisma.paymentLink.update({
      where: { id: params.id },
      data: {
        title: body.title ?? existing.title,
        description: body.description ?? existing.description,
        status: body.status ?? existing.status,
        amount: body.amount != null ? Number(body.amount) : existing.amount,
        buttonText: body.button_text ?? existing.buttonText,
        webhookUrl: body.webhook_url ?? existing.webhookUrl,
        redirectUrl: body.redirect_url ?? existing.redirectUrl,
      },
    })

    return NextResponse.json({ success: true, link: serializeLink(link) })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Update failed'
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
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
