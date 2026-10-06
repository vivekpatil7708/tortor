import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  merchantSettings: { findUnique: vi.fn() },
  merchant: { findUnique: vi.fn() },
  auditLog: { count: vi.fn() },
  paymentLink: { findUnique: vi.fn() },
}))
const send = vi.hoisted(() => vi.fn())
const logAudit = vi.hoisted(() => vi.fn())
const after = vi.hoisted(() => vi.fn())
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/audit', () => ({ logAudit }))
vi.mock('@/lib/emails/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/emails/service')>()),
  getEmailProvider: () => ({ sendTransactionalEmail: send }),
}))
vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/server')>()), after }))

import { ALERTS_PER_HOUR, queuePaidClaimAlert, sendPaidClaimAlert } from './payment-alerts'

// The saved transaction, as the route passes it (including fields the email must never use).
const claim = {
  id: 't1', merchantId: 'm1', txnId: 'TXN1759740000000ABC123', amount: 1499, paymentLinkId: 'L1',
  customerName: 'Visit evil.example to verify', customerNote: 'urgent: click http://evil.example',
}

beforeEach(() => {
  vi.clearAllMocks()
  db.merchantSettings.findUnique.mockResolvedValue({ emailEnabled: true, notificationEmail: null })
  db.merchant.findUnique.mockResolvedValue({ email: 'owner@ashacrafts.in' })
  db.auditLog.count.mockResolvedValue(0)
  db.paymentLink.findUnique.mockResolvedValue({ title: 'Diwali hamper <b>' })
  send.mockResolvedValue({ ok: true, providerMessageId: 'em_1' })
})

describe('payment alert emails (B9)', () => {
  it("emails the merchant's login address when no alert address is set", async () => {
    expect(await sendPaidClaimAlert(claim)).toBe('sent')

    const email = send.mock.calls[0][0]
    expect(email.to).toBe('owner@ashacrafts.in')
    expect(email.subject).toBe("A customer says they've paid ₹1,499")
    expect(email.html).toContain('Diwali hamper &lt;b&gt;')
    expect(email.html).toContain('TXN1759740000000ABC123')
    expect(email.html).toContain('/dashboard/transactions')
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ merchantId: 'm1', action: 'payment_alert_emailed', entityId: 't1' }))
  })

  it('uses the alert address from Settings when there is one', async () => {
    db.merchantSettings.findUnique.mockResolvedValue({ emailEnabled: true, notificationEmail: ' alerts@ashacrafts.in ' })
    await sendPaidClaimAlert(claim)
    expect(send.mock.calls[0][0].to).toBe('alerts@ashacrafts.in')
  })

  it('never includes anything the customer typed', async () => {
    await sendPaidClaimAlert(claim)
    const { subject, html } = send.mock.calls[0][0]
    expect(`${subject} ${html}`).not.toContain('evil.example')
  })

  it('leaves out a payment reference that is not in the normal format', async () => {
    await sendPaidClaimAlert({ ...claim, txnId: 'see www.evil.example' })
    expect(send.mock.calls[0][0].html).not.toContain('Reference')
  })

  it('sends nothing when alerts are off', async () => {
    db.merchantSettings.findUnique.mockResolvedValue({ emailEnabled: false, notificationEmail: 'alerts@ashacrafts.in' })
    expect(await sendPaidClaimAlert(claim)).toBe('off')
    expect(send).not.toHaveBeenCalled()

    db.merchantSettings.findUnique.mockResolvedValue(null)
    expect(await sendPaidClaimAlert(claim)).toBe('off')
  })

  it(`stops at ${ALERTS_PER_HOUR} emails an hour`, async () => {
    db.auditLog.count.mockResolvedValue(ALERTS_PER_HOUR)

    expect(await sendPaidClaimAlert(claim)).toBe('limit')
    expect(send).not.toHaveBeenCalled()
    const { where } = db.auditLog.count.mock.calls[0][0]
    expect(where).toMatchObject({ merchantId: 'm1', action: 'payment_alert_emailed' })
    expect(Date.now() - where.createdAt.gte.getTime()).toBeGreaterThanOrEqual(60 * 60_000 - 1000)
  })

  it("never throws, so a failed email can't affect the customer's \"I've paid\"", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    send.mockResolvedValueOnce({ ok: false, providerMessageId: null })
    expect(await sendPaidClaimAlert(claim)).toBe('failed')
    expect(logAudit).not.toHaveBeenCalled()

    send.mockRejectedValueOnce(new Error('network down'))
    expect(await sendPaidClaimAlert(claim)).toBe('failed')

    db.merchantSettings.findUnique.mockRejectedValueOnce(new Error('database down'))
    expect(await sendPaidClaimAlert(claim)).toBe('failed')
  })

  it("sends after the customer's answer has gone out", async () => {
    queuePaidClaimAlert(claim)

    expect(send).not.toHaveBeenCalled()
    expect(after).toHaveBeenCalledTimes(1)
    await after.mock.calls[0][0]()
    expect(send).toHaveBeenCalledTimes(1)
  })
})
