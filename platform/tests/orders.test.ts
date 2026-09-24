import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { makeMerchant, makeCustomer, makeProduct } from './helpers'

describe('integration: order lifecycle', () => {
  let merchantId = ''

  beforeAll(async () => {
    const m = await makeMerchant()
    merchantId = m.id
  })

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE shipment_events, packages, fulfillment_items, fulfillments, order_status_history, order_items, orders, products, customer_addresses, customers, audit_logs RESTART IDENTITY CASCADE'
    )
  })

  it('creates an order with computed totals for a customer', async () => {
    const { createOrder } = await import('@/lib/orders')
    const customer = await makeCustomer(merchantId)
    const product = await makeProduct(merchantId, { price: 249.99 })

    const order = await createOrder({
      merchantId,
      customerId: customer.id,
      items: [
        { productId: product.id, productName: product.name, unitPrice: 249.99, quantity: 2 },
        { productId: null, productName: 'Ebook', unitPrice: 10.5, quantity: 1 },
      ],
      shippingAmount: 50,
      discountAmount: 20,
      taxAmount: 5,
      paymentStatus: 'paid',
    })

    expect(order).not.toBeNull()
    expect(order!.orderNumber).toMatch(/^TP-/)
    expect(Number(order!.subtotalAmount)).toBe(510.48)
    expect(Number(order!.totalAmount)).toBe(545.48) // subtotal - discount + shipping + tax
    expect(order!.orderStatus).toBe('new')
    expect(order!.paymentStatus).toBe('paid')
    expect(order!.paidAt).not.toBeNull()
    expect(order!.trackingToken).toBeTruthy()
    expect(order!.orderItems).toHaveLength(2)

    // customer totals refreshed
    const updatedCustomer = await prisma.customer.findUnique({ where: { id: customer.id } })
    expect(updatedCustomer!.totalOrders).toBe(1)
    expect(Number(updatedCustomer!.totalSpent)).toBeCloseTo(545.48, 1)
  })

  it('creates an inline customer when none is provided', async () => {
    const { createOrder } = await import('@/lib/orders')
    const product = await makeProduct(merchantId, { price: 100 })
    const order = await createOrder({
      merchantId,
      customer: { fullName: 'Walk-in Guest', phone: '9811111111', email: 'guest@test.dev' },
      items: [{ productId: product.id, productName: product.name, unitPrice: 100, quantity: 1 }],
    })
    expect(order).not.toBeNull()
    expect(order!.customerId).not.toBeNull()
    const customer = await prisma.customer.findUnique({ where: { id: order!.customerId! } })
    expect(customer!.fullName).toBe('Walk-in Guest')
  })

  it('rejects an order where total would be negative', async () => {
    const { createOrder } = await import('@/lib/orders')
    await expect(
      createOrder({
        merchantId,
        items: [{ productId: null, productName: 'Cheap', unitPrice: 10, quantity: 1 }],
        discountAmount: 100,
      })
    ).rejects.toThrow('Total amount cannot be negative')
  })

  it('rejects fulfillment beyond remaining quantity (split shipment safety)', async () => {
    const { createOrder } = await import('@/lib/orders')
    const { createFulfillment } = await import('@/lib/fulfillments')
    const customer = await makeCustomer(merchantId)
    const product = await makeProduct(merchantId, { price: 100 })
    const order = await createOrder({
      merchantId,
      customerId: customer.id,
      items: [{ productId: product.id, productName: product.name, unitPrice: 100, quantity: 3 }],
    })
    const itemId = order!.orderItems[0].id

    // fulfill 2, then try to fulfill 2 more (only 1 remains)
    await createFulfillment({ merchantId, orderId: order!.id, fulfillmentType: 'shipping', items: [{ orderItemId: itemId, quantity: 2 }] })
    await expect(
      createFulfillment({ merchantId, orderId: order!.id, fulfillmentType: 'shipping', items: [{ orderItemId: itemId, quantity: 2 }] })
    ).rejects.toThrow(/remaining quantity/)
  })

  it('marks an order cancelled and cancels unshipped fulfillments', async () => {
    const { createOrder } = await import('@/lib/orders')
    const { createFulfillment, cancelOrder } = await import('@/lib/fulfillments')
    const customer = await makeCustomer(merchantId)
    const product = await makeProduct(merchantId, { price: 100 })
    const order = await createOrder({
      merchantId,
      customerId: customer.id,
      items: [{ productId: product.id, productName: product.name, unitPrice: 100, quantity: 2 }],
    })
    await createFulfillment({ merchantId, orderId: order!.id, fulfillmentType: 'shipping', items: [{ orderItemId: order!.orderItems[0].id, quantity: 1 }] })

    await cancelOrder({ merchantId, orderId: order!.id, reason: 'test' })

    const updated = await prisma.order.findUnique({ where: { id: order!.id }, include: { fulfillments: true, orderItems: true } })
    expect(updated!.orderStatus).toBe('cancelled')
    expect(updated!.fulfillmentSummaryStatus).toBe('cancelled')
    expect(updated!.fulfillments[0].status).toBe('cancelled')
    expect(updated!.orderItems[0].quantityCancelled).toBe(1) // remainder of unfilled quantity
  })
})