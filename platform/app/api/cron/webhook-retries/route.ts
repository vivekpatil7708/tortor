import { NextRequest, NextResponse } from 'next/server'
import { retryDueWebhookLogs } from '@/lib/webhooks'
import { processDueWebhookRetries } from '@/lib/webhook-delivery'
import { isCronRequestAuthorized } from '@/lib/webhook-retry'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Retries failed merchant webhooks. Called every 10 minutes by the GitHub
 * schedule (.github/workflows/webhook-retries.yml) and daily by Vercel Cron,
 * both sending `Authorization: Bearer <CRON_SECRET>`.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Webhook retries are not set up yet. Add CRON_SECRET in Vercel.' }, { status: 503 })
  }
  if (!isCronRequestAuthorized(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Stop starting new deliveries in time to finish inside the 60-second limit.
  const deadline = Date.now() + 40_000
  try {
    const paymentLinks = await retryDueWebhookLogs({ deadline })
    const checkout = await processDueWebhookRetries({ deadline })
    return NextResponse.json({ ok: true, retried: { payment_links: paymentLinks, checkout } })
  } catch (err) {
    console.error('Webhook retry run failed:', err)
    return NextResponse.json({ error: 'Retry run failed' }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
