import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { merchantToJson } from '@/lib/auth'
import { serializeLink } from '@/lib/serializers'

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const link = await prisma.paymentLink.findFirst({
    where: { slug: params.slug, status: 'active' },
  })

  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (link.expiryAt && link.expiryAt < new Date()) {
    return NextResponse.json({ error: 'Link expired' }, { status: 410 })
  }

  const merchant = await prisma.merchant.findUnique({ where: { id: link.merchantId } })
  if (!merchant || merchant.status === 'suspended') {
    return NextResponse.json({ error: 'Unavailable' }, { status: 403 })
  }

  return NextResponse.json({
    link: serializeLink(link),
    merchant: merchantToJson(merchant),
  })
}
