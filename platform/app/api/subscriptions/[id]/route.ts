import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { istDayKey, istDayStart } from '@/lib/ist-day'
import { linkAmountInput } from '@/lib/money'
import { apiError, publicErrorMessage } from '@/lib/api-response'
import {
  isBillingDay,
  isSubscriptionFrequency,
  isSubscriptionStatus,
} from '@/lib/subscription-plan'
import {
  cancelSubscriptionById,
  serializeSubscription,
} from '@/lib/subscriptions'

const MAX_PLAN_NAME = 120

const detailInclude = {
  customer: { select: { id: true, fullName: true, phone: true, email: true } },
  payments: {
    orderBy: { billingDate: 'desc' as const },
    take: 100,
    include: {
      paymentLink: { select: { slug: true, title: true } },
      transaction: { select: { txnId: true, status: true } },
    },
  },
}

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession()
    const { id } = await props.params
    const subscription = await prisma.subscription.findFirst({
      where: { id, merchantId: session.id },
      include: detailInclude,
    })
    if (!subscription) return apiError(404, 'Subscription not found')
    return NextResponse.json({ subscription: serializeSubscription(subscription) })
  } catch (err) {
    const message = publicErrorMessage(err, 'Could not load the subscription')
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 })
  }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession()
    const { id } = await props.params
    const existing = await prisma.subscription.findFirst({ where: { id, merchantId: session.id } })
    if (!existing) return apiError(404, 'Subscription not found')

    const body = await req.json().catch(() => ({}))
    if (body.status !== undefined) {
      if (!isSubscriptionStatus(body.status)) return apiError(400, 'Unknown subscription status')
      if (body.status === 'cancelled') {
        await cancelSubscriptionById(id, session.id)
        const cancelled = await prisma.subscription.findFirst({
          where: { id, merchantId: session.id },
          include: detailInclude,
        })
        return NextResponse.json({ subscription: cancelled ? serializeSubscription(cancelled) : null })
      }
    }

    const data: Prisma.SubscriptionUpdateInput = {}

    if (body.plan_name !== undefined) {
      const planName = typeof body.plan_name === 'string' ? body.plan_name.trim() : ''
      if (!planName) return apiError(400, 'Enter a plan name')
      if (planName.length > MAX_PLAN_NAME) return apiError(400, `Plan name must be ${MAX_PLAN_NAME} characters or fewer`)
      data.planName = planName
    }

    if (body.amount !== undefined) {
      const amount = linkAmountInput(body.amount, 'Amount')
      if (!amount.ok) return apiError(400, amount.error)
      if (amount.value === null) return apiError(400, 'Enter the amount to charge each time')
      data.amount = amount.value
    }

    if (body.frequency !== undefined) {
      if (!isSubscriptionFrequency(body.frequency)) return apiError(400, 'Choose weekly, monthly or yearly billing')
      data.frequency = body.frequency
    }

    if (body.next_billing_date !== undefined) {
      if (!isBillingDay(body.next_billing_date)) return apiError(400, 'Choose the next billing date')
      if (body.next_billing_date < istDayKey(new Date())) return apiError(400, 'The next billing date cannot be in the past')
      const nextBillingDate = istDayStart(body.next_billing_date)
      if (!nextBillingDate) return apiError(400, 'Choose the next billing date')
      data.nextBillingDate = nextBillingDate
    }

    if (body.status === 'active') {
      data.status = 'active'
      data.cancelledAt = null
    } else if (body.status === 'paused') {
      data.status = 'paused'
    }

    if (!Object.keys(data).length) return apiError(400, 'Nothing to update')

    await prisma.subscription.update({ where: { id }, data })
    const subscription = await prisma.subscription.findFirst({
      where: { id, merchantId: session.id },
      include: detailInclude,
    })
    return NextResponse.json({ subscription: subscription ? serializeSubscription(subscription) : null })
  } catch (err) {
    const message = publicErrorMessage(err, 'Could not update the subscription')
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 })
  }
}
