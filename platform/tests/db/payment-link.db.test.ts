import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { clearMockEmails, getMockEmails } from '@/lib/emails/provider'
import { GET as readStatus } from '@/app/api/transactions/route'
import { createLink, createMerchant, newTxnId, request, resetDatabase, signIn, signOut } from './helpers'
import { changePayment as change, startPayment as start } from './link-helpers'
import { runAfterTasks, testState } from './state'

const stored = (txnId: string) => prisma.transaction.findUniqueOrThrow({ where: { txnId } })
const webhookEvents = () => testState.webhooks.map(w => (JSON.parse(w.body) as { event: string }).event)
const customerSees = async (txnId: string) => (await (await readStatus(request(`/api/transactions?txn_id=${txnId}`))).json()).status

beforeEach(async () => {
  await resetDatabase()
  clearMockEmails()
})

describe('a payment-link payment on the real database (QA priority 2)', () => {
  it('goes from started to paid, with one webhook per change and one alert email', async () => {
    const merchant = await createMerchant({ alerts: true })
    const link = await createLink(merchant.id, { webhookUrl: 'https://shop.example/toropay-hook' })

    const { status, txnId } = await start(link.id)
    expect(status).toBe(200)
    expect(await stored(txnId)).toMatchObject({ status: 'initiated', amount: 499, merchantId: merchant.id })
    expect((await prisma.paymentLink.findUniqueOrThrow({ where: { id: link.id } })).useCount).toBe(1)

    // The customer taps "I've paid".
    expect((await change(txnId, { status: 'pending' })).status).toBe(200)
    expect(await stored(txnId)).toMatchObject({ status: 'pending' })
    await runAfterTasks()
    expect(getMockEmails().map(e => e.to)).toEqual([merchant.email])
    expect(await prisma.auditLog.count({ where: { merchantId: merchant.id, action: 'payment_alert_emailed' } })).toBe(1)

    // The merchant confirms it.
    signIn(merchant)
    expect((await change(txnId, { status: 'success', merchant_action: true })).status).toBe(200)
    const paid = await stored(txnId)
    expect(paid).toMatchObject({ status: 'success', settlementStatus: 'settled', settlementAmount: 499 })
    expect(paid.confirmedAt).toBeInstanceOf(Date)

    // The customer's page reads the stored status, and the merchant's site heard about each change once.
    expect(await customerSees(txnId)).toBe('success')
    expect(webhookEvents()).toEqual(['payment.pending', 'payment.success'])
    expect(await prisma.webhookLog.count({ where: { merchantId: merchant.id } })).toBe(2)
  })

  it('stores a rejected payment as failed, with nothing settled', async () => {
    const merchant = await createMerchant()
    const link = await createLink(merchant.id)
    const { txnId } = await start(link.id)
    await change(txnId, { status: 'pending' })

    signIn(merchant)
    expect((await change(txnId, { status: 'failed', merchant_action: true })).status).toBe(200)

    expect(await stored(txnId)).toMatchObject({ status: 'failed', settlementAmount: null })
    expect(await customerSees(txnId)).toBe('failed')
  })

  it("won't let a customer confirm their own payment, or another merchant confirm it", async () => {
    const merchant = await createMerchant()
    const stranger = await createMerchant()
    const link = await createLink(merchant.id)
    const { txnId } = await start(link.id)

    signOut()
    expect((await change(txnId, { status: 'success' })).status).toBe(401)
    signIn(stranger)
    expect((await change(txnId, { status: 'success', merchant_action: true })).status).toBe(403)

    expect(await stored(txnId)).toMatchObject({ status: 'initiated' })
  })

  it('refuses a changed price and a payment reference in the wrong format, saving nothing', async () => {
    const merchant = await createMerchant()
    const link = await createLink(merchant.id)

    expect((await start(link.id, newTxnId(), 1)).status).toBe(400)
    expect((await start(link.id, 'TXN 1; DROP TABLE')).status).toBe(400)

    expect(await prisma.transaction.count()).toBe(0)
  })
})
