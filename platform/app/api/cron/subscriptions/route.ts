import { NextRequest, NextResponse } from 'next/server'
import { isCronRequestAuthorized } from '@/lib/webhook-retry'
import { runSubscriptionBilling } from '@/lib/subscriptions'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Daily recurring billing. Creates a one-time payment link for every
 * subscription due today and sends the three-day renewal reminders.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'Subscriptions are not set up yet. Add CRON_SECRET in Vercel.' },
      { status: 503 },
    )
  }
  if (!isCronRequestAuthorized(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await runSubscriptionBilling({ deadline: Date.now() + 45_000 })
    return NextResponse.json({ success: true, ...summary })
  } catch (err) {
    console.error('Subscription billing failed:', err)
    return NextResponse.json({ error: 'Subscription billing failed' }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
