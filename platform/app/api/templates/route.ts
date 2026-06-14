import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeTemplate } from '@/lib/serializers'

export async function GET() {
  try {
    const session = await requireSession()
    const templates = await prisma.template.findMany({
      where: { merchantId: session.id },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(templates.map(serializeTemplate))
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    const { name, config } = await req.json()
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })

    const template = await prisma.template.create({
      data: {
        merchantId: session.id,
        name,
        config: JSON.stringify(config || {}),
      },
    })
    return NextResponse.json({ template: serializeTemplate(template) })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
