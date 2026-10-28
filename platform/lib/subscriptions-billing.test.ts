import { beforeEach, describe, expect, it, vi } from 'vitest'
import { istDayStart } from './ist-day'

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  subscription: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  subscriptionPayment: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  upiId: { findFirst: vi.fn() },
  paymentLink: { updateMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

const link = vi.hoisted(() => ({ createPaymentLink: vi.fn() }))
vi.mock('@/lib/payment-link-create', () => link)

const messaging = vi.hoisted(() => ({ sendMessage: vi.fn() }))
vi.mock('@/lib/messaging/engine', () => messaging)

import { runSubscriptionBilling } from './subscriptions'

const now = new Date('2026-11-03T03:30:00.000Z')

function subscriptionRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 's1',
    merchantId: 'm1',
    customerId: 'c1',
    planName: 'Care plan',
    amount: 499,
    frequency: 'monthly',
    nextBillingDate: istDayStart('2026-11-03')!,
    status: 'active',
    cancelToken: 'cancel-token-1234567890',
    lastBilledAt: null,
    customer: { id: 'c1', fullName: 'Asha Rao', phone: '9876543210', email: 'asha@example.com' },
    merchant: {
      businessName: 'Asha Store',
      email: 'owner@example.com',
      defaultCurrency: 'INR',
      supportEmail: 'help@example.com',
      supportPhone: '9999999999',
    },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.test'
  db.subscription.findMany.mockImplementation(async (args: { where: { nextBillingDate?: { gt?: unknown } } }) =>
    args.where.nextBillingDate?.gt ? [] : [subscriptionRow()],
  )
  db.subscription.findUnique.mockResolvedValue({ status: 'active' })
  db.subscriptionPayment.findUnique.mockResolvedValue(null)
  db.subscriptionPayment.create.mockResolvedValue({ id: 'sp1', status: 'pending', paymentLinkId: null })
  db.subscriptionPayment.update.mockResolvedValue({})
  db.upiId.findFirst.mockResolvedValue({ vpa: 'store@upi' })
  link.createPaymentLink.mockResolvedValue({ ok: true, link: { id: 'pl1', slug: 'sub-pay-1' } })
  messaging.sendMessage.mockResolvedValue({ channel: 'whatsapp', status: 'sent' })
  db.$transaction.mockImplementation(async (operations: Promise<unknown>[]) => Promise.all(operations))
  db.subscription.update.mockResolvedValue({})
})

describe('daily subscription billing', () => {
  it('creates a one-time payment link and messages the customer', async () => {
    const summary = await runSubscriptionBilling({ now, appUrl: 'https://app.test' })

    expect(summary).toEqual(expect.objectContaining({ due: 1, billed: 1, failed: 0, reminders: 0 }))
    expect(link.createPaymentLink).toHaveBeenCalledWith('m1', expect.objectContaining({
      amount: 499,
      max_uses: 1,
      upi_id: 'store@upi',
    }))
    expect(db.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 's1' },
      data: expect.objectContaining({
        nextBillingDate: istDayStart('2026-12-03'),
      }),
    }))
    expect(messaging.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'whatsapp',
      eventType: 'subscription_payment_due',
      context: expect.objectContaining({
        plan_name: 'Care plan',
        payment_link: 'https://app.test/pay/sub-pay-1',
        cancel_link: 'https://app.test/subscriptions/cancel/cancel-token-1234567890',
      }),
    }))
  })

  it('records a failed attempt when the merchant has no active UPI ID', async () => {
    db.upiId.findFirst.mockResolvedValue(null)

    const summary = await runSubscriptionBilling({ now, appUrl: 'https://app.test' })

    expect(summary).toEqual(expect.objectContaining({ due: 1, billed: 0, failed: 1 }))
    expect(link.createPaymentLink).not.toHaveBeenCalled()
    expect(db.subscriptionPayment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'failed' }),
    }))
  })

  it('sends one reminder inside the three-day window', async () => {
    const reminder = subscriptionRow({ nextBillingDate: istDayStart('2026-11-05')! })
    db.subscription.findMany.mockImplementation(async (args: { where: { nextBillingDate?: { gt?: unknown } } }) =>
      args.where.nextBillingDate?.gt ? [reminder] : [],
    )

    const summary = await runSubscriptionBilling({ now, appUrl: 'https://app.test' })

    expect(summary).toEqual(expect.objectContaining({ due: 0, reminders: 1, reminderFailures: 0 }))
    expect(messaging.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'subscription_renewal_reminder',
      idempotencyKey: 'subscription-reminder:s1:2026-11-05:whatsapp',
    }))
    expect(db.subscription.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { lastReminderAt: now },
    })
  })
})
