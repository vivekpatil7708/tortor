import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { makeMerchant, makeCustomer, makeProduct } from './helpers'
import { createOrder } from '@/lib/orders'
import { createFulfillment } from '@/lib/fulfillments'
import { createReturnRequest, transitionReturn, canTransitionReturn } from '@/lib/returns'

const TRUNCATE =
  'returns, return_items, shipment_events, packages, fulfillment_items, fulfillments, order_status_history, order_items, orders, products, customers, audit_logs'

describe('integration: returns (Phase 4)', () => {
  let merchantId = ''

  beforeAll(async () => {
    merchantId = (await makeMerchant()).id
  })

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TRUNCATE} RESTART IDENTITY CASCADE`)
  })

  async function makeDeliveredOrder(quantity = 2) {
    const customer = await makeCustomer(merchantId)
    const product = await makeProduct(merchantId, { price: 100 })
    const order = await createOrder({
      merchantId,
      customerId: customer.id,
      items: [{ productId: product.id, productName: product.name, unitPrice: 100, quantity }],
    })
    const itemId = order!.orderItems[0].id
    await createFulfillment({
      merchantId,
      orderId: order!.id,
      fulfillmentType: 'shipping',
      items: [{ orderItemId: itemId, quantity }],
    })
    return { order, product, itemId }
  }

  it('creates a return, validates delivered quantity, and enforces transition rules', async () => {
    const { order, itemId } = await makeDeliveredOrder(2)

    const ret = await createReturnRequest({
      merchantId,
      orderId: order!.id,
      items: [{ orderItemId: itemId, quantity: 1, reason: 'Wrong size' }],
    })
    expect(ret!.status).toBe('requested')
    expect(ret!.returnNumber).toMatch(/^RTR-/)

    // Cannot exceed what has actually been delivered.
    await expect(
      createReturnRequest({ merchantId, orderId: order!.id, items: [{ orderItemId: itemId, quantity: 3 }] }),
    ).rejects.toThrow('cannot exceed delivered quantity')

    expect(canTransitionReturn('requested', 'approved')).toBe(true)
    expect(canTransitionReturn('requested', 'return_in_transit')).toBe(false)

    await transitionReturn({ merchantId, returnId: ret!.id, to: 'approved' })
    const approved = await prisma.returnRequest.findUnique({ where: { id: ret!.id } })
    expect(approved!.status).toBe('approved')
    expect(approved!.approvedAt).not.toBeNull()

    await expect(
      transitionReturn({ merchantId, returnId: ret!.id, to: 'return_in_transit' }),
    ).rejects.toThrow("Cannot move return from 'approved'")
  })

  it('walks a return through approval→received and blocks invalid jumps', async () => {
    const { order, itemId } = await makeDeliveredOrder(2)
    const ret = await createReturnRequest({
      merchantId,
      orderId: order!.id,
      items: [{ orderItemId: itemId, quantity: 1 }],
    })

    for (const to of ['approved', 'return_pickup_scheduled', 'return_in_transit', 'returned_to_merchant']) {
      await transitionReturn({ merchantId, returnId: ret!.id, to })
    }

    const walk = await prisma.returnRequest.findUnique({ where: { id: ret!.id } })
    expect(walk!.status).toBe('returned_to_merchant')
    expect(walk!.receivedAt).not.toBeNull()

    // refund_pending is only reachable after goods are received.
    await expect(
      transitionReturn({ merchantId, returnId: ret!.id, to: 'refunded' }),
    ).rejects.toThrow("Cannot move return from 'returned_to_merchant'")
  })
})