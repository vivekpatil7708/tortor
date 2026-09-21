import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureFeedbackTable } from '@/lib/feedback-schema'

const USEFUL_PARTS = [
  'Creating payment links',
  'Sharing payment links with customers',
  'Tracking payments',
  'Payment reminders',
  'Dashboard and reporting',
  'Customer support',
  'Other',
]

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const merchantName = String(body.merchantName || '').trim()
    const satisfaction = Number(body.satisfaction)
    const easeOfUse = Number(body.easeOfUse)
    const usefulPartsRaw = Array.isArray(body.usefulParts)
      ? (body.usefulParts as unknown[]).map((p: unknown) => String(p))
      : []
    const usefulParts = usefulPartsRaw.filter(p => USEFUL_PARTS.includes(p))
    const easeCollecting = String(body.easeCollecting || '')
    const likesMost = String(body.likesMost || '').trim() || null
    const issues = String(body.issues || '').trim() || null
    const improvement = String(body.improvement || '').trim() || null
    const npsScore = Number(body.npsScore)
    const followUp = body.followUp === true || body.followUp === 'true'
    const contact = String(body.contact || '').trim() || null

    if (!merchantName) {
      return NextResponse.json({ error: 'Business name is required' }, { status: 400 })
    }
    if (!Number.isInteger(satisfaction) || satisfaction < 1 || satisfaction > 5) {
      return NextResponse.json({ error: 'Satisfaction must be between 1 and 5' }, { status: 400 })
    }
    if (!Number.isInteger(easeOfUse) || easeOfUse < 1 || easeOfUse > 5) {
      return NextResponse.json({ error: 'Ease of use must be between 1 and 5' }, { status: 400 })
    }
    const validCollecting = ['Yes, significantly', 'Yes, somewhat', 'No major difference', 'No, it has not']
    if (!validCollecting.includes(easeCollecting)) {
      return NextResponse.json({ error: 'Invalid collecting payments response' }, { status: 400 })
    }
    if (!Number.isInteger(npsScore) || npsScore < 0 || npsScore > 10) {
      return NextResponse.json({ error: 'NPS score must be between 0 and 10' }, { status: 400 })
    }
    if (followUp && !contact) {
      return NextResponse.json({ error: 'Contact is required when opting in for follow-up' }, { status: 400 })
    }

    await ensureFeedbackTable()

    const response = await prisma.feedbackResponse.create({
      data: {
        merchantName,
        satisfaction,
        easeOfUse,
        usefulParts: JSON.stringify(usefulParts),
        easeCollecting,
        likesMost,
        issues,
        improvement,
        npsScore,
        followUp,
        contact: contact || null,
      },
    })

    return NextResponse.json({ success: true, id: response.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('Feedback submit failed:', err)
    return NextResponse.json({ error: `Submission failed: ${msg}` }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}