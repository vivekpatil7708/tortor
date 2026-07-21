import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DEFAULT_TEMPLATES } from '@/lib/messaging'

export async function GET() {
  try {
    const session = await requireSession()
    const templates = await prisma.messageTemplate.findMany({
      where: { merchantId: session.id },
      orderBy: { channel: 'asc' },
    })
    return NextResponse.json({ templates })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireSession()
    const { channel, name, subject, body, reset } = await req.json()

    if (reset) {
      const defaults = DEFAULT_TEMPLATES[channel as string]
      if (!defaults) return NextResponse.json({ error: 'Invalid channel' }, { status: 400 })
      const template = await prisma.messageTemplate.upsert({
        where: { merchantId_channel_name: { merchantId: session.id, channel, name: 'Default' } },
        update: { subject: defaults.subject, body: defaults.body },
        create: { merchantId: session.id, channel, name: 'Default', subject: defaults.subject, body: defaults.body, isDefault: true },
      })
      return NextResponse.json({ template })
    }

    if (!channel || !body) {
      return NextResponse.json({ error: 'channel and body are required' }, { status: 400 })
    }

    const template = await prisma.messageTemplate.upsert({
      where: { merchantId_channel_name: { merchantId: session.id, channel, name: name || 'Default' } },
      update: { subject: subject || '', body },
      create: { merchantId: session.id, channel, name: name || 'Default', subject: subject || '', body, isDefault: name === 'Default' || undefined },
    })

    return NextResponse.json({ template })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
