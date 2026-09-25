import { NextRequest, NextResponse } from 'next/server'
import { handleError, badRequest } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { messageSegment } from '@/lib/segments'
import type { SegmentPreset } from '@/lib/segments'

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    const body = await req.json()
    const preset = body.preset as SegmentPreset
    if (!preset) return badRequest('preset is required')
    const channel = body.channel as 'whatsapp' | 'instagram' | 'email'
    if (!['whatsapp', 'instagram', 'email'].includes(channel)) return badRequest('Invalid channel')

    const result = await messageSegment({
      merchantId: session.id,
      preset,
      channel,
      includeOptedOut: Boolean(body.includeOptedOut),
    })
    return NextResponse.json(result)
  } catch (err) {
    return handleError(err)
  }
}