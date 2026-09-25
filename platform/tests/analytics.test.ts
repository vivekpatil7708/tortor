import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { makeMerchant, makeCustomer, makeProduct } from './helpers'
import { createOrder } from '@/lib/orders'
import { runOrderAnalytics, runMovement, dateGroupKey, dateGroupLabel } from '@/lib/analytics/engine'

const TRUNCATE = 'order_status_history, order_items, orders, products, customers, audit_logs'

describe('integration: order analytics (Phase 4)', () => {
  let merchantId = ''

  beforeAll(async () => {
    merchantId = (await makeMerchant()).id
  })

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TRUNCATE} RESTART IDENTITY CASCADE`)
  })

  it('buckets orders into timeseries, statuses, top SKUs and channels', async () => {
    const customer = await makeCustomer(merchantId)
    const productA = await makeProduct(merchantId, { price: 100, name: 'Product A' })
    const productB = await makeProduct(merchantId, { price: 50, name: 'Product B' })

    const order1 = await createOrder({
      merchantId,
      customerId: customer.id,
      source: 'payment_link',
      items: [
        { productId: productA.id, productName: productA.name, sku: 'SKU-A', unitPrice: 100, quantity: 2 },
        { productId: productB.id, productName: productB.name, sku: 'SKU-B', unitPrice: 50, quantity: 1 },
      ],
    })
    const order2 = await createOrder({
      merchantId,
      customerId: customer.id,
      source: 'manual_order',
      items: [{ productId: productB.id, productName: productB.name, sku: 'SKU-B', unitPrice: 50, quantity: 3 }],
    })

    await prisma.$transaction([
      prisma.order.update({ where: { id: order1!.id }, data: { paymentStatus: 'paid', paidAt: new Date() } }),
      prisma.order.update({ where: { id: order2!.id }, data: { paymentStatus: 'refunded', paidAt: new Date() } }),
    ])

    const result = await runOrderAnalytics({ merchantId, groupBy: 'month' })
    expect(result.summary.orders).toBe(2)
    expect(result.summary.revenue).toBe(400)
    expect(result.summary.unitsSold).toBe(6)
    expect(result.timeseries).toHaveLength(1)
    expect(result.timeseries[0].orders).toBe(2)
    expect(result.byStatus.find(b => b.payment_status === 'paid')!._count).toBe(1)
    expect(result.byStatus.find(b => b.payment_status === 'refunded')!._count).toBe(1)
    expect(result.topSKUs.map(s => s.units)).toEqual(expect.arrayContaining([4, 2]))
    expect(result.topChannels.some(c => c.source === 'payment_link')).toBe(true)

    // Status funnel view (paid = money received, which includes refunded orders).
    const paidOnly = await runOrderAnalytics({ merchantId, status: 'paid' })
    expect(paidOnly.byStatus.map(b => b.payment_status).sort()).toEqual(['paid', 'refunded'])

    // Date helpers used by the dashboard timeline.
    expect(dateGroupKey(new Date('2026-03-15T10:00:00Z'), 'day')).toBe('2026-03-15')
    expect(dateGroupKey(new Date('2026-03-15T10:00:00Z'), 'month')).toBe('2026-03')
    expect(dateGroupLabel('2026-03-15', 'day')).toContain('15')

    // Movement numbers exist for the sparkline.
    const movement = await runMovement({ merchantId })
    expect(typeof movement.revenueMoM).toBe('number')
    expect(typeof movement.ordersWoW).toBe('number')
  })
})