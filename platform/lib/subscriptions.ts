import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { createPaymentLink } from '@/lib/payment-link-create'
import { sendMessage, type ChannelDispatchResult } from '@/lib/messaging/engine'
import { istDayEnd, istDayKey, istDayStart } from '@/lib/ist-day'
import {
  addDaysToDay,
  advanceBillingDay,
  frequencyLabel,
  isSubscriptionFrequency,
  type SubscriptionFrequency,
} from '@/lib/subscription-plan'

// Recurring billing lives here so the dashboard API and the daily cron share the
// same rules: what "due" means, which payment link is created, and how a
// cancellation stops future attempts.

export const SUBSCRIPTIONS_PER_RUN = 25
const BILLING_RUN_BUDGET_MS = 45_000

export type SubscriptionCustomer = {
  id: string
  fullName: string
  phone: string | null
  email: string | null
}

export type SubscriptionMerchant = {
  businessName: string
  email: string
  defaultCurrency: string
  supportEmail: string | null
  supportPhone: string | null
}

export type SubscriptionWithDetails = {
  id: string
  planName: string
  amount: number
  frequency: string
  nextBillingDate: Date
  status: string
  lastReminderAt: Date | null
  lastBilledAt: Date | null
  cancelledAt: Date | null
  createdAt: Date
  updatedAt: Date
  customer: SubscriptionCustomer
  payments?: SubscriptionPaymentView[]
}

export type SubscriptionPaymentView = {
  id: string
  amount: number
  status: string
  billingDate: Date
  paymentLinkId: string | null
  transactionId: string | null
  failureReason: string | null
  paidAt: Date | null
  createdAt: Date
  paymentLink?: { slug: string; title: string } | null
  transaction?: { txnId: string; status: string } | null
}

export type BillingSummary = {
  due: number
  billed: number
  skipped: number
  failed: number
  reminders: number
  reminderFailures: number
  timedOut: boolean
  errors: string[]
}

/** A long random capability token for the customer's cancellation page. */
export function newSubscriptionCancelToken(): string {
  return crypto.randomBytes(24).toString('hex')
}

export function publicAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://www.toropay.co.in').replace(/\/+$/, '')
}

export function subscriptionCancelUrl(token: string, appUrl = publicAppUrl()): string {
  return `${appUrl.replace(/\/+$/, '')}/subscriptions/cancel/${encodeURIComponent(token)}`
}

export function formatSubscriptionAmount(amount: number): string {
  return amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatBillingDay(at: Date): string {
  return at.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
}

export function serializeSubscription(subscription: SubscriptionWithDetails) {
  return {
    id: subscription.id,
    plan_name: subscription.planName,
    amount: subscription.amount,
    frequency: subscription.frequency,
    next_billing_date: subscription.nextBillingDate.toISOString(),
    status: subscription.status,
    last_reminder_at: subscription.lastReminderAt?.toISOString() ?? null,
    last_billed_at: subscription.lastBilledAt?.toISOString() ?? null,
    cancelled_at: subscription.cancelledAt?.toISOString() ?? null,
    created_at: subscription.createdAt.toISOString(),
    updated_at: subscription.updatedAt.toISOString(),
    customer: {
      id: subscription.customer.id,
      full_name: subscription.customer.fullName,
      phone: subscription.customer.phone,
      email: subscription.customer.email,
    },
    ...(subscription.payments ? { payments: subscription.payments.map(serializeSubscriptionPayment) } : {}),
  }
}

export function serializeSubscriptionPayment(payment: SubscriptionPaymentView) {
  return {
    id: payment.id,
    amount: payment.amount,
    status: payment.status,
    billing_date: payment.billingDate.toISOString(),
    payment_link_id: payment.paymentLinkId,
    payment_link: payment.paymentLink
      ? {
          slug: payment.paymentLink.slug,
          title: payment.paymentLink.title,
          url: `${publicAppUrl()}/pay/${payment.paymentLink.slug}`,
        }
      : null,
    transaction_id: payment.transactionId,
    transaction: payment.transaction
      ? { txn_id: payment.transaction.txnId, status: payment.transaction.status }
      : null,
    failure_reason: payment.failureReason,
    paid_at: payment.paidAt?.toISOString() ?? null,
    created_at: payment.createdAt.toISOString(),
  }
}

function messageContext(params: {
  subscription: Pick<
    SubscriptionWithDetails,
    'planName' | 'amount' | 'nextBillingDate' | 'status'
  >
  customer: SubscriptionCustomer
  merchant: SubscriptionMerchant
  cancelLink: string
  paymentLink?: string
}) {
  const { subscription, customer, merchant, cancelLink, paymentLink } = params
  return {
    customer_name: customer.fullName || 'Customer',
    business_name: merchant.businessName || merchant.email,
    plan_name: subscription.planName,
    amount: formatSubscriptionAmount(subscription.amount),
    currency: merchant.defaultCurrency || 'INR',
    next_billing_date: formatBillingDay(subscription.nextBillingDate),
    payment_link: paymentLink ?? '',
    cancel_link: cancelLink,
    support_email: merchant.supportEmail || merchant.email,
    support_phone: merchant.supportPhone || '',
  }
}

const DELIVERED_STATUSES = new Set<ChannelDispatchResult['status']>(['sent', 'queued', 'duplicate'])

async function sendOnChannel(params: {
  merchantId: string
  customerId: string
  channel: 'email' | 'whatsapp'
  to: string
  eventType: string
  idempotencyKey: string
  context: Record<string, string>
}): Promise<ChannelDispatchResult> {
  try {
    return await sendMessage({
      merchantId: params.merchantId,
      customerId: params.customerId,
      channel: params.channel,
      eventType: params.eventType,
      to: params.to,
      context: params.context,
      idempotencyKey: params.idempotencyKey,
    })
  } catch (err) {
    return {
      channel: params.channel,
      status: 'failed',
      reason: err instanceof Error ? err.message : 'send_failed',
    }
  }
}

/**
 * Send a subscription message, preferring WhatsApp and falling back to email
 * when the customer has no phone or WhatsApp could not deliver. The
 * idempotency key keeps retries from flooding the customer.
 */
export async function sendSubscriptionNotice(params: {
  merchantId: string
  customerId: string
  customer: SubscriptionCustomer
  merchant: SubscriptionMerchant
  eventType: 'subscription_payment_due' | 'subscription_renewal_reminder'
  idempotencyBase: string
  context: Record<string, string>
}): Promise<{ ok: boolean; channel: string | null; reason?: string }> {
  const { customer, idempotencyBase, context, eventType } = params

  if (customer.phone) {
    const whatsapp = await sendOnChannel({
      merchantId: params.merchantId,
      customerId: params.customerId,
      channel: 'whatsapp',
      to: customer.phone,
      eventType,
      idempotencyKey: `${idempotencyBase}:whatsapp`,
      context,
    })
    if (DELIVERED_STATUSES.has(whatsapp.status)) {
      return { ok: true, channel: 'whatsapp' }
    }
  }

  if (customer.email) {
    const email = await sendOnChannel({
      merchantId: params.merchantId,
      customerId: params.customerId,
      channel: 'email',
      to: customer.email,
      eventType,
      idempotencyKey: `${idempotencyBase}:email`,
      context,
    })
    if (DELIVERED_STATUSES.has(email.status)) {
      return { ok: true, channel: 'email' }
    }
    return { ok: false, channel: 'email', reason: email.reason || 'send_failed' }
  }

  if (customer.phone) return { ok: false, channel: 'whatsapp', reason: 'whatsapp_failed' }
  return { ok: false, channel: null, reason: 'customer_has_no_contact' }
}

type BillingSubscription = Pick<
  SubscriptionWithDetails,
  | 'id'
  | 'planName'
  | 'amount'
  | 'frequency'
  | 'nextBillingDate'
  | 'status'
  | 'lastBilledAt'
> & {
  merchantId: string
  customerId: string
  cancelToken: string
  customer: SubscriptionCustomer
  merchant: SubscriptionMerchant
}

async function billOne(
  subscription: BillingSubscription,
  now: Date,
  appUrl: string,
): Promise<'billed' | 'skipped' | 'failed'> {
  if (!isSubscriptionFrequency(subscription.frequency)) {
    throw new Error(`Unknown subscription frequency: ${subscription.frequency}`)
  }
  const frequency = subscription.frequency as SubscriptionFrequency

  const billingDate = subscription.nextBillingDate
  let payment = await prisma.subscriptionPayment.findUnique({
    where: {
      subscriptionId_billingDate: {
        subscriptionId: subscription.id,
        billingDate,
      },
    },
  })

  // A link already generated for this billing date is not created twice, even
  // if the cron runs again later the same day.
  if (payment && (payment.status === 'paid' || payment.status === 'cancelled')) return 'skipped'
  if (payment?.paymentLinkId) return 'skipped'

  if (!payment) {
    try {
      payment = await prisma.subscriptionPayment.create({
        data: {
          subscriptionId: subscription.id,
          merchantId: subscription.merchantId,
          customerId: subscription.customerId,
          amount: subscription.amount,
          billingDate,
          status: 'pending',
        },
      })
    } catch (err) {
      // Another run may have created the row first.
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') return 'skipped'
      throw err
    }
  }

  const upi = await prisma.upiId.findFirst({
    where: { merchantId: subscription.merchantId, status: 'active' },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  })
  if (!upi) {
    await prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: { status: 'failed', failureReason: 'Add an active UPI ID to receive subscription payments.' },
    })
    return 'failed'
  }

  // The customer may have cancelled while we were looking up the UPI ID.
  const stillActive = await prisma.subscription.findUnique({
    where: { id: subscription.id },
    select: { status: true },
  })
  if (!stillActive || stillActive.status !== 'active') {
    await prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: { status: 'cancelled', failureReason: 'Subscription is no longer active' },
    })
    return 'skipped'
  }

  const created = await createPaymentLink(subscription.merchantId, {
    title: `${subscription.planName} - ${frequencyLabel(frequency)} subscription`,
    description: `Subscription payment due ${formatBillingDay(billingDate)}.`,
    amount: subscription.amount,
    amount_flexible: false,
    max_uses: 1,
    button_text: 'Pay now',
    upi_id: upi.vpa,
  })
  if (!created.ok) {
    await prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: { status: 'failed', failureReason: created.error },
    })
    return 'failed'
  }

  const nextDay = advanceBillingDay(istDayKey(billingDate), frequency, now)
  const nextBillingDate = istDayStart(nextDay)
  if (!nextBillingDate) throw new Error(`Could not schedule the next billing date: ${nextDay}`)

  await prisma.$transaction([
    prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        paymentLinkId: created.link.id,
        amount: subscription.amount,
        status: 'pending',
        failureReason: null,
      },
    }),
    prisma.subscription.update({
      where: { id: subscription.id },
      data: { nextBillingDate, lastBilledAt: now },
    }),
  ])

  // A cancellation may have landed between the check above and the write.
  // Never send a fresh link for a plan the customer just stopped.
  const afterWrite = await prisma.subscription.findUnique({
    where: { id: subscription.id },
    select: { status: true },
  })
  if (!afterWrite || afterWrite.status !== 'active') {
    await prisma.paymentLink.updateMany({
      where: { id: created.link.id, merchantId: subscription.merchantId },
      data: { status: 'inactive' },
    })
    await prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: { status: 'cancelled', failureReason: 'Subscription is no longer active' },
    })
    return 'skipped'
  }

  const paymentLink = `${appUrl}/pay/${created.link.slug}`
  await sendSubscriptionNotice({
    merchantId: subscription.merchantId,
    customerId: subscription.customerId,
    customer: subscription.customer,
    merchant: subscription.merchant,
    eventType: 'subscription_payment_due',
    idempotencyBase: `subscription-due:${payment.id}`,
    context: messageContext({
      subscription: { ...subscription, nextBillingDate: billingDate },
      customer: subscription.customer,
      merchant: subscription.merchant,
      cancelLink: subscriptionCancelUrl(subscription.cancelToken, appUrl),
      paymentLink,
    }),
  })

  return 'billed'
}

async function sendReminders(now: Date, appUrl: string, deadline: number): Promise<{
  sent: number
  failed: number
  errors: string[]
}> {
  const today = istDayKey(now)
  const reminderEnd = istDayEnd(addDaysToDay(today, 3))
  if (!reminderEnd) return { sent: 0, failed: 0, errors: [] }

  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: 'active',
      // Billing dates are stored at the start of the IST day, so use a strict
      // end: a plan due four days from today must wait until tomorrow.
      nextBillingDate: { gt: now, lt: reminderEnd },
    },
    orderBy: { nextBillingDate: 'asc' },
    take: SUBSCRIPTIONS_PER_RUN,
    include: {
      customer: { select: { id: true, fullName: true, phone: true, email: true } },
      merchant: {
        select: {
          businessName: true,
          email: true,
          defaultCurrency: true,
          supportEmail: true,
          supportPhone: true,
        },
      },
    },
  })

  let sent = 0
  let failed = 0
  const errors: string[] = []

  for (const subscription of subscriptions) {
    if (Date.now() > deadline) break
    const billingDay = istDayKey(subscription.nextBillingDate)
    const result = await sendSubscriptionNotice({
      merchantId: subscription.merchantId,
      customerId: subscription.customerId,
      customer: subscription.customer,
      merchant: subscription.merchant,
      eventType: 'subscription_renewal_reminder',
      idempotencyBase: `subscription-reminder:${subscription.id}:${billingDay}`,
      context: messageContext({
        subscription,
        customer: subscription.customer,
        merchant: subscription.merchant,
        cancelLink: subscriptionCancelUrl(subscription.cancelToken, appUrl),
      }),
    })

    if (result.ok) {
      sent += 1
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { lastReminderAt: now },
      })
    } else {
      failed += 1
      if (result.reason && result.reason !== 'customer_has_no_contact') {
        errors.push(`${subscription.id}: ${result.reason}`)
      }
    }
  }

  return { sent, failed, errors }
}

/**
 * The daily job: create a one-time payment link for every subscription due
 * today, and remind customers whose next billing date is within three days.
 */
export async function runSubscriptionBilling(options: {
  now?: Date
  appUrl?: string
  deadline?: number
  limit?: number
} = {}): Promise<BillingSummary> {
  const now = options.now ?? new Date()
  const appUrl = options.appUrl ?? publicAppUrl()
  const deadline = options.deadline ?? Date.now() + BILLING_RUN_BUDGET_MS
  const limit = options.limit ?? SUBSCRIPTIONS_PER_RUN

  const summary: BillingSummary = {
    due: 0,
    billed: 0,
    skipped: 0,
    failed: 0,
    reminders: 0,
    reminderFailures: 0,
    timedOut: false,
    errors: [],
  }

  // Reminders first: if the run runs out of time, customers closest to renewal
  // still hear from us before today's billing attempts.
  const reminders = await sendReminders(now, appUrl, deadline)
  summary.reminders = reminders.sent
  summary.reminderFailures = reminders.failed
  summary.errors.push(...reminders.errors)

  const due = await prisma.subscription.findMany({
    where: { status: 'active', nextBillingDate: { lte: now } },
    orderBy: { nextBillingDate: 'asc' },
    take: limit,
    include: {
      customer: { select: { id: true, fullName: true, phone: true, email: true } },
      merchant: {
        select: {
          businessName: true,
          email: true,
          defaultCurrency: true,
          supportEmail: true,
          supportPhone: true,
        },
      },
    },
  })

  summary.due = due.length
  for (const subscription of due) {
    if (Date.now() > deadline) {
      summary.timedOut = true
      break
    }
    try {
      const outcome = await billOne(subscription, now, appUrl)
      if (outcome === 'billed') summary.billed += 1
      else if (outcome === 'skipped') summary.skipped += 1
      else summary.failed += 1
    } catch (err) {
      summary.failed += 1
      summary.errors.push(`${subscription.id}: ${err instanceof Error ? err.message : 'billing_failed'}`)
    }
  }

  return summary
}

async function stopSubscription(subscription: { id: string; merchantId: string; status: string }) {
  if (subscription.status === 'cancelled') return false

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: 'cancelled', cancelledAt: new Date() },
  })

  const pending = await prisma.subscriptionPayment.findMany({
    where: { subscriptionId: subscription.id, status: 'pending' },
    select: { id: true, paymentLinkId: true },
  })
  const linkIds = pending.map(payment => payment.paymentLinkId).filter((id): id is string => !!id)
  if (linkIds.length) {
    await prisma.paymentLink.updateMany({
      where: { id: { in: linkIds }, merchantId: subscription.merchantId },
      data: { status: 'inactive' },
    })
  }
  if (pending.length) {
    await prisma.subscriptionPayment.updateMany({
      where: { subscriptionId: subscription.id, status: 'pending' },
      data: { status: 'cancelled', failureReason: 'Subscription cancelled' },
    })
  }
  return true
}

/** Cancel a subscription from the merchant dashboard. */
export async function cancelSubscriptionById(id: string, merchantId: string) {
  const subscription = await prisma.subscription.findFirst({ where: { id, merchantId } })
  if (!subscription) return null
  const changed = await stopSubscription(subscription)
  if (!changed) return subscription
  return prisma.subscription.findUnique({ where: { id } })
}

/** Cancel a subscription from the customer's capability link. Idempotent. */
export async function cancelSubscriptionByToken(token: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { cancelToken: token },
    include: {
      customer: { select: { id: true, fullName: true, phone: true, email: true } },
      merchant: {
        select: {
          businessName: true,
          email: true,
          defaultCurrency: true,
          supportEmail: true,
          supportPhone: true,
        },
      },
    },
  })
  if (!subscription) return null
  const alreadyCancelled = subscription.status === 'cancelled'
  if (!alreadyCancelled) await stopSubscription(subscription)

  return {
    subscription: { ...subscription, status: 'cancelled', cancelledAt: subscription.cancelledAt ?? new Date() },
    alreadyCancelled,
  }
}
