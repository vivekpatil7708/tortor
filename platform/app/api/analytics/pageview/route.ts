import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const { path } = await req.json()

    if (!path || typeof path !== 'string') {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown'

    const referrer = req.headers.get('referer') || undefined

    await prisma.pageView.create({
      data: { path, ipAddress: ipAddress === 'unknown' ? null : ipAddress, referrer },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
