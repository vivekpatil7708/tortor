import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { ensureFeedbackTable } from '@/lib/feedback-schema'

export async function GET() {
  try {
    await requireAdmin()
    await ensureFeedbackTable()

    const responses = await prisma.feedbackResponse.findMany({ orderBy: { createdAt: 'desc' } })

    const total = responses.length
    let npsSum = 0
    let promoters = 0
    let passives = 0
    let detractors = 0
    const satisfactionSum = responses.reduce((a, r) => a + r.satisfaction, 0)
    const easeSum = responses.reduce((a, r) => a + r.easeOfUse, 0)
    const followUps = responses.filter(r => r.followUp).length

    responses.forEach(r => {
      npsSum += r.npsScore
      if (r.npsScore >= 9) promoters += 1
      else if (r.npsScore >= 7) passives += 1
      else detractors += 1
    })

    const nps = total === 0 ? 0 : Math.round(((promoters - detractors) / total) * 100)

    return NextResponse.json({
      summary: {
        total,
        nps,
        promoters,
        passives,
        detractors,
        avg_satisfaction: total === 0 ? 0 : Number((satisfactionSum / total).toFixed(1)),
        avg_ease_of_use: total === 0 ? 0 : Number((easeSum / total).toFixed(1)),
        follow_ups: followUps,
      },
      responses: responses.map(r => ({
        id: r.id,
        merchant_name: r.merchantName,
        satisfaction: r.satisfaction,
        ease_of_use: r.easeOfUse,
        useful_parts: JSON.parse(r.usefulParts || '[]') as string[],
        ease_collecting: r.easeCollecting,
        likes_most: r.likesMost,
        issues: r.issues,
        improvement: r.improvement,
        nps_score: r.npsScore,
        follow_up: r.followUp,
        contact: r.contact,
        created_at: r.createdAt.toISOString(),
      })),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error'
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500 })
  }
}