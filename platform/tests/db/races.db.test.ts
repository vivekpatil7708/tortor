import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createApiKey, createLink, createMerchant, resetDatabase, signIn, unique } from './helpers'
import { changePayment, startPayment } from './link-helpers'
import { createOrder, deliverWebhook, orderBody } from './checkout-helpers'
import { testState } from './state'

beforeEach(resetDatabase)

describe('two requests at the same moment (QA priority 3)', () => {
  it('two confirms of one payment apply it once and send one webhook', async () => {
    const merchant = await createMerchant()
    const link = await createLink(merchant.id, { webhookUrl: 'https://shop.example/toropay-hook' })
    const { txnId } = await startPayment(link.id)
    await changePayment(txnId, { status: 'pending' })
    testState.webhooks.length = 0

    signIn(merchant)
    const answers = await Promise.all([1, 2].map(() => changePayment(txnId, { status: 'success', merchant_action: true })))

    // The second one either sees it already paid (200, no change) or loses the race (409).
    expect(answers.every(a => a.status === 200 || a.status === 409)).toBe(true)
    expect(testState.webhooks.map(w => JSON.parse(w.body).event)).toEqual(['payment.success'])
    expect(await prisma.transaction.findUniqueOrThrow({ where: { txnId } })).toMatchObject({ status: 'success' })
  })

  it("two customers can't both take a single-use link's last use", async () => {
    const merchant = await createMerchant()
    const link = await createLink(merchant.id, { maxUses: 1 })

    const results = await Promise.all([startPayment(link.id), startPayment(link.id)])

    expect(results.map(r => r.status).sort()).toEqual([200, 410])
    expect(await prisma.transaction.count({ where: { paymentLinkId: link.id } })).toBe(1)
  })

  it('the same provider event delivered twice at once is processed once', async () => {
    const merchant = await createMerchant({ withUpi: false }) // card-provider checkout (test mode)
    const order = await createOrder(await createApiKey(merchant.id), orderBody())
    const event = JSON.stringify({ id: `evt_${unique()}`, event: 'payment.succeeded', reference: order.body.payment_reference, amount: 499, currency: 'INR' })

    const answers = await Promise.all([deliverWebhook(event), deliverWebhook(event)])
    const bodies = await Promise.all(answers.map(a => a.json()))

    expect(answers.map(a => a.status)).toEqual([200, 200])
    expect(bodies.filter(b => b.duplicate)).toHaveLength(1)
    expect(await prisma.webhookEvent.count()).toBe(1)
    expect(await prisma.payment.findFirstOrThrow({ where: { paymentReference: order.body.payment_reference } })).toMatchObject({ status: 'paid' })
  })
})
