import { NextRequest, NextResponse } from 'next/server'
import { publicErrorMessage } from '@/lib/api-response'
import { cancelSubscriptionByToken } from '@/lib/subscriptions'

// This is a capability link: the random token is what proves the customer may
// cancel this one subscription. No dashboard login is involved.

export async function POST(_req: NextRequest, props: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await props.params
    if (!token || token.length < 16) {
      return NextResponse.json({ error: 'This cancellation link is not valid.' }, { status: 404 })
    }

    const result = await cancelSubscriptionByToken(token)
    if (!result) {
      return NextResponse.json({ error: 'This cancellation link is not valid.' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      already_cancelled: result.alreadyCancelled,
      subscription: {
        plan_name: result.subscription.planName,
        status: result.subscription.status,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: publicErrorMessage(err, 'Could not cancel the subscription. Please contact the business.') },
      { status: 500 },
    )
  }
}
