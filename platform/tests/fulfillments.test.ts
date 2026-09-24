import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { makeMerchant, makeCustomer, makeProduct } from './helpers'

describe('integration: fulfillment & tracking', () => {
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

  it('supports split shipments across multiple fulfillments', async () => {
    const { createOrder } = await import('@/lib/orders')
    const { createFulfillment } = await import('@/lib/fulfillments')
    const customer = await makeCustomer(merchantId)
    const product = await makeProduct(merchantId, { price: 100 })
    const order = await createOrder({
      merchantId,
      customerId: customer.id,
      items: [{ productId: product.id, productName: product.name, unitPrice: 100, quantity: 4 }],
    })
    const itemId = order!.orderItems[0].id

    // Partially allocate first
    await createFulfillment({ merchantId, orderId: order!.id, fulfillmentType: 'shipping', items: [{ orderItemId: itemId, quantity: 1 }] })
    let updated = await prisma.order.findUnique({ where: { id: order!.id } })
    expect(updated!.fulfillmentSummaryStatus).toBe('partially_fulfilled')

    // Second shipment completes the allocation
    const f1 = await createFulfillment({ merchantId, orderId: order!.id, fulfillmentType: 'shipping', items: [{ orderItemId: itemId, quantity: 3 }] })
    const f2 = f1
    const fulfillments = await prisma.fulfillment.findMany({ where: { orderId: order!.id }, include: { items: true, packages: true } })

    expect(fulfillments).toHaveLength(2)
    expect(fulfillments[0].fulfillmentNumber).not.toBe(fulfillments[1].fulfillmentNumber)
    expect(fulfillments.map(f => f.items[0].quantity).sort()).toEqual([1, 3])

    // both shipping fulfillments got a package
    expect(fulfillments[0].packages).toHaveLength(1)
    expect(fulfillments[1].packages).toHaveLength(1)

    updated = await prisma.order.findUnique({ where: { id: order!.id } })
    expect(updated!.fulfillmentSummaryStatus).toBe('fulfilled')
    void f2
  })

  it('adding tracking marks the fulfillment shipped and writes a timeline event', async () => {
    const { createOrder } = await import('@/lib/orders')
    const { createFulfillment, addPackageTracking } = await import('@/lib/fulfillments')
    const customer = await makeCustomer(merchantId)
    const product = await makeProduct(merchantId, { price: 100 })
    const order = await createOrder({
      merchantId,
      customerId: customer.id,
      items: [{ productId: product.id, productName: product.name, unitPrice: 100, quantity: 1 }],
    })
    const f = await createFulfillment({ merchantId, orderId: order!.id, fulfillmentType: 'shipping', items: [{ orderItemId: order!.orderItems[0].id, quantity: 1 }] })
    const pkgId = f!.packages[0].id

    const res = await addPackageTracking({
      merchantId,
      orderId: order!.id,
      packageId: pkgId,
      courierProvider: 'Delhivery',
      trackingNumber: 'DLV123456',
      trackingUrl: 'https://delhivery.com/123',
    })

    expect(res.package.trackingNumber).toBe('DLV123456')
    expect(res.fulfillmentStatus).toBe('shipped')

    const pkg = await prisma.package.findUnique({ where: { id: pkgId }, include: { events: true, fulfillment: true } })
    expect(pkg!.packageStatus).toBe('shipped')
    expect(pkg!.fulfillment.status).toBe('shipped')
    expect(pkg!.events.length).toBeGreaterThanOrEqual(1)
  })

  it('manual shipment events appear on the public timeline', async () => {
    const { createOrder } = await import('@/lib/orders')
    const { createFulfillment, addShipmentEvent } = await import('@/lib/fulfillments')
    const customer = await makeCustomer(merchantId)
    const product = await makeProduct(merchantId, { price: 100 })
    const order = await createOrder({
      merchantId,
      customerId: customer.id,
      items: [{ productId: product.id, productName: product.name, unitPrice: 100, quantity: 1 }],
    })
    const f = await createFulfillment({ merchantId, orderId: order!.id, fulfillmentType: 'shipping', items: [{ orderItemId: order!.orderItems[0].id, quantity: 1 }] })

    await addShipmentEvent({
      merchantId,
      orderId: order!.id,
      packageId: f!.packages[0].id,
      eventLabel: 'Out for delivery',
      eventStatus: 'out_for_delivery',
      location: 'Bengaluru',
    })

    const events = await prisma.shipmentEvent.findMany({ where: { packageId: f!.packages[0].id } })
    expect(events).toHaveLength(1)
    expect(events[0].eventLabel).toBe('Out for delivery')
    expect(events[0].eventStatus).toBe('out_for_delivery')
  })

  it('recaps summary to delivered when every package is delivered', async () => {
    const { createOrder } = await import('@/lib/orders')
    const { createFulfillment, setPackageStatus } = await import('@/lib/fulfillments')
    const customer = await makeCustomer(merchantId)
    const product = await makeProduct(merchantId, { price: 100 })
    const order = await createOrder({
      merchantId,
      customerId: customer.id,
      items: [{ productId: product.id, productName: product.name, unitPrice: 100, quantity: 2 }],
    })
    const f = await createFulfillment({ merchantId, orderId: order!.id, fulfillmentType: 'shipping', items: [{ orderItemId: order!.orderItems[0].id, quantity: 2 }] })
    const pkgId = f!.packages[0].id

    await expect(setPackageStatus({ merchantId, orderId: order!.id, packageId: pkgId, nextStatus: 'delivered' })).resolves.toBeTruthy()

    const updated = await prisma.order.findUnique({ where: { id: order!.id } })
    expect(updated!.fulfillmentSummaryStatus).toBe('delivered')
  })

  it('customers cannot run operations on another merchant order', async () => {
    const { createOrder } = await import('@/lib/orders')
    const { addPackageTracking } = await import('@/lib/fulfillments')
    const merchantB = await makeMerchant({ businessName: 'Other Store' })
    const customerB = await makeCustomer(merchantB.id)
    const productB = await makeProduct(merchantB.id, { price: 50 })
    const otherOrder = await createOrder({
      merchantId: merchantB.id,
      customerId: customerB.id,
      items: [{ productId: productB.id, productName: productB.name, unitPrice: 50, quantity: 1 }],
    })
    const f = await (await import('@/lib/fulfillments')).createFulfillment({
      merchantId: merchantB.id,
      orderId: otherOrder!.id,
      fulfillmentType: 'shipping',
      items: [{ orderItemId: otherOrder!.orderItems[0].id, quantity: 1 }],
    })

    // merchant 1 tries to touch merchant 2's package
    await expect(
      addPackageTracking({
        merchantId, // wrong tenant
        orderId: otherOrder!.id,
        packageId: f!.packages[0].id,
        trackingNumber: 'XXXX',
      })
    ).rejects.toThrow(/Package not found/)
  })
})