import { beforeEach, describe, expect, it, vi } from 'vitest'

// New Zapier-style triggers: creating an order or a payment link should emit a
// webhook without making the underlying write depend on the receiver.
const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  upiId: { findFirst: vi.fn() },
  paymentLink: { create: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/checkout', () => ({ TOROPAY_PUBLIC_URL: 'https://checkout.test' }))

const webhooks = vi.hoisted(() => ({ dispatchMerchantWebhook: vi.fn() }))
vi.mock('@/lib/webhook-delivery', () => webhooks)

import { createOrder } from '@/lib/orders'
import { createPaymentLink } from '@/lib/payment-link-create'

const dec = (n: number) => ({ toNumber: () => n })

function fakeTx() {
  const order = {
    id: 'o1',
    orderNumber: 'TP-2026-0001',
    orderStatus: 'new',
    paymentStatus: 'pending',
    totalAmount: dec(100),
    currency: 'INR',
    source: 'manual_order',
    merchantOrderReference: null,
  }
  const created = {
    ...order,
    orderItems: [{
      productNameSnapshot: 'Sample item',
      skuSnapshot: null,
      quantityOrdered: 1,
      unitPrice: dec(100),
      lineTotal: dec(100),
    }],
    customer: { id: 'c1', fullName: 'Asha Rao', email: 'asha@example.com', phone: '9876543210' },
  }
  return {
    order: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...order,
        orderNumber: data.orderNumber,
      })),
      aggregate: vi.fn().mockResolvedValue({
        _count: { id: 1 },
        _sum: { totalAmount: dec(100) },
        _max: { createdAt: new Date('2026-10-01T00:00:00Z') },
      }),
      findUnique: vi.fn().mockResolvedValue(created),
    },
    customer: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'c1' }),
      update: vi.fn().mockResolvedValue({}),
    },
    orderItem: { create: vi.fn().mockResolvedValue({}) },
    orderStatusHistory: { create: vi.fn().mockResolvedValue({}) },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  webhooks.dispatchMerchantWebhook.mockResolvedValue([])
  db.upiId.findFirst.mockResolvedValue({ id: 'upi1', vpa: 'shop@upi' })
  db.paymentLink.create.mockResolvedValue({
    id: 'pl1', merchantId: 'm1', upiId: 'shop@upi', title: 'October invoice',
    amount: 100, amountFlexible: false, slug: 'october-invoice',
  })
})

describe('payment_link.created', () => {
  it('emits the trigger after the link is saved', async () => {
    const result = await createPaymentLink('m1', {
      title: 'October invoice',
      upi_id: 'shop@upi',
      amount: 100,
    })

    expect(result.ok).toBe(true)
    expect(webhooks.dispatchMerchantWebhook).toHaveBeenCalledWith({
      merchantId: 'm1',
      mode: 'live',
      eventType: 'payment_link.created',
      data: expect.objectContaining({
        link_id: 'pl1',
        title: 'October invoice',
        slug: 'october-invoice',
        link_url: 'https://checkout.test/pay/october-invoice',
        amount: 100,
        upi_id: 'shop@upi',
      }),
    })
  })

  it('still creates the link when the webhook cannot be queued', async () => {
    webhooks.dispatchMerchantWebhook.mockRejectedValueOnce(new Error('webhook store down'))

    const result = await createPaymentLink('m1', {
      title: 'October invoice',
      upi_id: 'shop@upi',
      amount: 100,
    })

    expect(result.ok).toBe(true)
  })
})

describe('order.created and customer.created', () => {
  it('emits both triggers after an order creates a customer', async () => {
    const tx = fakeTx()
    db.$transaction.mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx))

    const order = await createOrder({
      merchantId: 'm1',
      customer: { fullName: 'Asha Rao', email: 'asha@example.com', phone: '9876543210' },
      items: [{ productName: 'Sample item', unitPrice: 100, quantity: 1 }],
      source: 'manual_order',
    })

    expect(order?.id).toBe('o1')
    expect(webhooks.dispatchMerchantWebhook).toHaveBeenNthCalledWith(1, {
      merchantId: 'm1',
      mode: 'live',
      eventType: 'customer.created',
      data: {
        customer_id: 'c1',
        full_name: 'Asha Rao',
        email: 'asha@example.com',
        phone: '9876543210',
      },
    })
    expect(webhooks.dispatchMerchantWebhook).toHaveBeenNthCalledWith(2, {
      merchantId: 'm1',
      mode: 'live',
      eventType: 'order.created',
      data: expect.objectContaining({
        order_id: 'o1',
        order_number: 'TP-2026-0001',
        amount: 100,
        currency: 'INR',
        customer: expect.objectContaining({ id: 'c1' }),
        items: [expect.objectContaining({ name: 'Sample item', quantity: 1 })],
      }),
    })
  })
})
