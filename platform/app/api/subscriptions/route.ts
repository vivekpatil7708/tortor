import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { EMAIL_NOT_VERIFIED } from '@/lib/email-verification'
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
  newSubscriptionCancelToken,
  serializeSubscription,
} from '@/lib/subscriptions'

const MAX_PLAN_NAME = 120

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession()
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const customerId = searchParams.get('customer_id')
    const q = searchParams.get('q')?.trim()

    if (status && !isSubscriptionStatus(status)) return apiError(400, 'Unknown subscription status')

    const where = {
      merchantId: session.id,
      ...(status ? { status } : {}),
      ...(customerId ? { customerId } : {}),
      ...(q
        ? {
            OR: [
              { planName: { contains: q, mode: 'insensitive' as const } },
              { customer: { fullName: { contains: q, mode: 'insensitive' as const } } },
              { customer: { phone: { contains: q, mode: 'insensitive' as const } } },
              { customer: { email: { contains: q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    }

    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          customer: { select: { id: true, fullName: true, phone: true, email: true } },
          payments: {
            orderBy: { billingDate: 'desc' },
            take: 5,
            include: {
              paymentLink: { select: { slug: true, title: true } },
              transaction: { select: { txnId: true, status: true } },
            },
          },
        },
      }),
      prisma.subscription.count({ where }),
    ])

    return NextResponse.json({
      subscriptions: subscriptions.map(serializeSubscription),
      total,
    })
  } catch (err) {
    const message = publicErrorMessage(err, 'Could not load subscriptions')
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    if (!session.emailVerifiedAt) {
      return apiError(403, EMAIL_NOT_VERIFIED)
    }

    const body = await req.json().catch(() => ({}))
    const customerId = typeof body.customer_id === 'string' ? body.customer_id.trim() : ''
    const planName = typeof body.plan_name === 'string' ? body.plan_name.trim() : ''
    const frequency = body.frequency
    const amount = linkAmountInput(body.amount, 'Amount')
    const billingDay = body.next_billing_date

    if (!customerId) return apiError(400, 'Choose a customer')
    if (!planName) return apiError(400, 'Enter a plan name')
    if (planName.length > MAX_PLAN_NAME) return apiError(400, `Plan name must be ${MAX_PLAN_NAME} characters or fewer`)
    if (!isSubscriptionFrequency(frequency)) return apiError(400, 'Choose weekly, monthly or yearly billing')
    if (!amount.ok) return apiError(400, amount.error)
    if (amount.value === null) return apiError(400, 'Enter the amount to charge each time')
    if (!isBillingDay(billingDay)) return apiError(400, 'Choose the next billing date')

    const nextBillingDate = istDayStart(billingDay)
    if (!nextBillingDate) return apiError(400, 'Choose the next billing date')
    if (billingDay < istDayKey(new Date())) return apiError(400, 'The next billing date cannot be in the past')

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, merchantId: session.id },
      select: { id: true, fullName: true, phone: true, email: true },
    })
    if (!customer) return apiError(404, 'Customer not found')

    const subscription = await prisma.subscription.create({
      data: {
        merchantId: session.id,
        customerId: customer.id,
        planName,
        amount: amount.value,
        frequency,
        nextBillingDate,
        status: 'active',
        cancelToken: newSubscriptionCancelToken(),
      },
      include: {
        customer: { select: { id: true, fullName: true, phone: true, email: true } },
      },
    })

    return NextResponse.json({ subscription: serializeSubscription(subscription) }, { status: 201 })
  } catch (err) {
    const message = publicErrorMessage(err, 'Could not create the subscription')
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 })
  }
}
