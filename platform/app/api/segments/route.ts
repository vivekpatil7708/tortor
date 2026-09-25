import { NextRequest, NextResponse } from 'next/server'
import { handleError, badRequest } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { listSegmentPresets, saveSegmentPreset, deleteSegmentPreset } from '@/lib/segments'
import type { SegmentPreset } from '@/lib/segments'

export async function GET() {
  try {
    const session = await requireSession()
    return NextResponse.json({ segments: await listSegmentPresets(session.id) })
  } catch (err) {
    return handleError(err, 'Unauthorized')
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    const body = await req.json()
    const action = body.action

    if (action === 'save') {
      const preset = body.preset as SegmentPreset
      if (!preset?.id || !preset.name) return badRequest('preset.id and preset.name are required')
      const next = await saveSegmentPreset(session.id, preset)
      return NextResponse.json({ segments: next })
    }

    if (action === 'delete' || action === 'destroy') {
      if (!body.id) return badRequest('id is required')
      const next = await deleteSegmentPreset(session.id, body.id)
      return NextResponse.json({ segments: next })
    }

    return badRequest('Unknown action')
  } catch (err) {
    return handleError(err)
  }
}