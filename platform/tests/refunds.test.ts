import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { makeMerchant, makeCustomer, makeProduct } from './helpers'
import { createOrder } from '@/lib/orders'
import { createFulfillment } from '@/lib/fulfillments'
import { createReturnRequest, transitionReturn } from '@/lib/returns'
import { createRefund, initiateRefund, getRefundableAmount, completeRefundFromProviderWebhook } from '@/lib/refunds'

const TRUNCATE =
  'returns, return_items, refunds, payments, shipment_events, packages, fulfillment_items, fulfillments, order_status_history, order_items, orders, products, customers, audit_logs, message_logs'

let seq = 0
function uid(prefix: string) {
  seq += 1
  return `${prefix}_${Date.now()}_${seq}`
}

describe('integration: refunds (Phase 4)', () => {
  let merchantId = ''

  beforeAll(async () => {
    merchantId = (await makeMerchant()).id
  })

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TRUNCATE} RESTART IDENTITY CASCADE`)
  })

  async function makePaidOrder(amount = 250) {
    const customer = await makeCustomer(merchantId)
    const product = await makeProduct(merchantId, { price: amount })
    const order = await createOrder({
      merchantId,
      customerId: customer.id,
      items: [{ productId: product.id, productName: product.name, unitPrice: amount, quantity: 1 }],
    })
    const itemId = order!.orderItems[0].id
    await createFulfillment({ merchantId, orderId: order!.id, fulfillmentType: 'shipping', items: [{ orderItemId: itemId, quantity: 1 }] })

    const payment = await prisma.payment.create({
      data: {
        merchantId,
        orderId: order!.id,
        checkoutSessionId: uid('cses'),
        paymentReference: uid('payref'),
        provider: 'mock',
        providerPaymentId: uid('mockpay'),
        amount,
        status: 'paid',
        paidAt: new Date(),
      },
    })
    return { order, payment }
  }

  it('caps refunds at the original payment amount and allows partial refunds', async () => {
    const { order, payment } = await makePaidOrder(250)

    const first = await createRefund({ merchantId, orderId: order!.id, paymentId: payment.id, amount: 100, reason: 'Partial' })
    expect(first!.status).toBe('pending')
    expect(await getRefundableAmount(payment.id)).toBe(150)

    await expect(
      createRefund({ merchantId, orderId: order!.id, paymentId: payment.id, amount: 200, reason: 'Too big' }),
    ).rejects.toThrow('exceeds the refundable amount')

    await expect(
      createRefund({ merchantId, orderId: order!.id, paymentId: payment.id, amount: 0, reason: 'Zero' }),
    ).rejects.toThrow('greater than zero')
  })

  it('initiates a refund via the mock provider and completes it from the provider webhook', async () => {
    const { order, payment } = await makePaidOrder(250)
    const ret = await createReturnRequest({
      merchantId,
      orderId: order!.id,
      items: [{ orderItemId: order!.orderItems[0].id, quantity: 1, reason: 'Damaged' }],
    })
    for (const to of ['approved', 'return_pickup_scheduled', 'return_in_transit', 'returned_to_merchant', 'refund_pending']) {
      await transitionReturn({ merchantId, returnId: ret!.id, to })
    }

    const refund = await createRefund({ merchantId, orderId: order!.id, paymentId: payment.id, returnId: ret!.id, amount: 250, reason: 'Damaged item' })
    const initiated = await initiateRefund({ merchantId, refundId: refund!.id })
    expect(initiated.status).toBe('initiated')
    expect(initiated.refund.providerRefundId).toBeTruthy()
    expect(initiated.refund.returnId).toBe(ret!.id)

    const completed = await completeRefundFromProviderWebhook({
      merchantId,
      paymentId: payment.id,
      providerRefundId: initiated.refund.providerRefundId,
      amount: 250,
    })
    expect(completed.ok).toBe(true)

    const finalized = await prisma.refund.findUnique({ where: { id: refund!.id } })
    expect(finalized!.status).toBe('completed')
    expect(finalized!.completedAt).not.toBeNull()

    const fin = await prisma.returnRequest.findUnique({ where: { id: ret!.id } })
    expect(fin!.status).toBe('refunded')

    // Second completion attempt finds nothing to complete.
    const again = await completeRefundFromProviderWebhook({ merchantId, paymentId: payment.id, providerRefundId: initiated.refund.providerRefundId })
    expect(again.ok).toBe(false)
  })
})