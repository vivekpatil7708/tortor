import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { makeMerchant, makeCustomer, makeProduct } from './helpers'

describe('tenant isolation', () => {
  let merchantA = ''
  let merchantB = ''

  beforeAll(async () => {
    merchantA = (await makeMerchant({ businessName: 'Store A' })).id
    merchantB = (await makeMerchant({ businessName: 'Store B' })).id
  })

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE shipment_events, packages, fulfillment_items, fulfillments, order_status_history, order_items, orders, products, customer_addresses, customers, audit_logs RESTART IDENTITY CASCADE'
    )
  })

  it('orders are scoped per merchant', async () => {
    const { createOrder } = await import('@/lib/orders')

    for (const mid of [merchantA, merchantB]) {
      const customer = await makeCustomer(mid)
      const product = await makeProduct(mid, { price: 10 })
      await createOrder({
        merchantId: mid,
        customerId: customer.id,
        items: [{ productId: product.id, productName: product.name, unitPrice: 10, quantity: 1 }],
      })
    }

    const ordersA = await prisma.order.findMany({ where: { merchantId: merchantA } })
    const ordersB = await prisma.order.findMany({ where: { merchantId: merchantB } })
    expect(ordersA).toHaveLength(1)
    expect(ordersB).toHaveLength(1)
    expect(ordersA[0].merchantId).not.toBe(ordersB[0].merchantId)
  })

  it('customers are not visible across merchants', async () => {
    const cA = await makeCustomer(merchantA)
    const cB = await makeCustomer(merchantB)

    const forA = await prisma.customer.findMany({ where: { merchantId: merchantA } })
    expect(forA.map(c => c.id)).toContain(cA.id)
    expect(forA.map(c => c.id)).not.toContain(cB.id)
    expect(forA).toHaveLength(1)
  })

  it('same customer id cannot be reached from another merchant scope', async () => {
    const { createOrder } = await import('@/lib/orders')
    const customer = await makeCustomer(merchantA)
    const product = await makeProduct(merchantA, { price: 10 })
    const order = await createOrder({
      merchantId: merchantA,
      customerId: customer.id,
      items: [{ productId: product.id, productName: product.name, unitPrice: 10, quantity: 1 }],
    })

    // merchantB tries to update merchantA's order via setOrderStatus
    const { setOrderStatus } = await import('@/lib/orders')
    await expect(
      setOrderStatus({ merchantId: merchantB, orderId: order!.id, nextStatus: 'processing' as any })
    ).rejects.toThrow(/Order not found/)
  })
})