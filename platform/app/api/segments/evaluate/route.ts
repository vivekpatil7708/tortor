import { NextRequest, NextResponse } from 'next/server'
import { handleError, badRequest } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { evaluateSegment } from '@/lib/segments'
import type { SegmentPreset } from '@/lib/segments'

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    const body = await req.json()
    const preset = body.preset as SegmentPreset
    if (!preset) return badRequest('preset is required')
    const evaluation = await evaluateSegment(session.id, preset)
    return NextResponse.json(evaluation)
  } catch (err) {
    return handleError(err)
  }
}