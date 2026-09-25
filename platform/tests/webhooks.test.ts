import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import http from 'node:http'
import { prisma } from '@/lib/prisma'
import { makeMerchant } from './helpers'
import { createCheckout } from '@/lib/checkout'
import { processProviderWebhook } from '@/lib/payments/webhook-processor'
import { buildMockWebhookPayload, MOCK_WEBHOOK_SECRET } from '@/lib/payments/mock'
import { dispatchMerchantWebhook, retryWebhookDelivery, generateWebhookSecret, signWebhook } from '@/lib/webhook-delivery'

async function signAndProcess(providerPaymentId: string, body: { event: string; provider_event_id: string; amount: number; currency?: string; extra?: Record<string, unknown> }) {
  const payload = buildMockWebhookPayload({
    event: body.event as never,
    providerEventId: body.provider_event_id,
    paymentId: providerPaymentId,
    amount: body.amount,
    currency: body.currency,
    extra: body.extra,
  })
  const rawBody = JSON.stringify(payload)
  const signature = signWebhook(rawBody, MOCK_WEBHOOK_SECRET)
  return processProviderWebhook({ provider: 'mock', rawBody, signature, secret: MOCK_WEBHOOK_SECRET })
}

describe('integration: incoming provider webhooks', () => {
  let merchantId = ''
  let checkout = { paymentId: '', paymentRef: '', orderId: '' }

  beforeAll(async () => {
    merchantId = (await makeMerchant()).id
  })

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE webhook_events, webhook_delivery_logs, webhook_endpoints, email_logs, email_templates, payments, order_status_history, order_items, orders, customers RESTART IDENTITY CASCADE'
    )
    const result = await createCheckout({
      merchantId,
      mode: 'live',
      customer: { name: 'Paying Customer', email: 'paying@test.dev' },
      items: [{ productName: 'Tee', quantity: 1, unitPrice: 500 }],
    })
    const payment = await prisma.payment.findUnique({ where: { checkoutSessionId: result.checkout_session_id } })
    checkout = {
      paymentId: payment!.providerPaymentId!,
      paymentRef: payment!.paymentReference,
      orderId: result.toropay_order_id,
    }
  })

  it('rejects a tampered signature without touching the payment', async () => {
    const payload = buildMockWebhookPayload({
      event: 'payment.succeeded',
      providerEventId: 'evt_bad',
      paymentId: checkout.paymentId,
      amount: 500,
    })
    const rawBody = JSON.stringify(payload)
    const result = await processProviderWebhook({ provider: 'mock', rawBody, signature: 'deadbeef', secret: MOCK_WEBHOOK_SECRET })

    expect(result.signatureValid).toBe(false)
    const realPayment = await prisma.payment.findFirst({ where: { providerPaymentId: checkout.paymentId } })
    expect(realPayment!.status).toBe('pending')
    const stored = await prisma.webhookEvent.findMany({ where: { processingStatus: 'bad_signature' } })
    expect(stored).toHaveLength(1)
  })

  it('marks a payment paid, advances the order and fires emails', async () => {
    const result = await signAndProcess(checkout.paymentId, {
      event: 'payment.succeeded',
      provider_event_id: 'evt_ok_1',
      amount: 500,
    })
    expect(result).toMatchObject({ signatureValid: true, changed: true, flagged: false })

    const payment = await prisma.payment.findFirst({ where: { providerPaymentId: checkout.paymentId } })
    expect(payment!.status).toBe('paid')
    expect(payment!.paidAt).not.toBeNull()

    const order = await prisma.order.findUnique({ where: { id: checkout.orderId } })
    expect(order!.paymentStatus).toBe('paid')

    const applied = await prisma.webhookEvent.findUnique({ where: { id: result.eventId } })
    expect(applied!.processingStatus).toBe('processed')
    expect(applied!.paymentId).not.toBeNull()

    const emailLogs = await prisma.emailLog.findMany()
    expect(emailLogs.some(l => l.templateKey === 'payment_received')).toBe(true)
  })

  it('ignores duplicate deliveries', async () => {
    await signAndProcess(checkout.paymentId, {
      event: 'payment.succeeded',
      provider_event_id: 'evt_dup',
      amount: 500,
    })
    const dup = await signAndProcess(checkout.paymentId, {
      event: 'payment.succeeded',
      provider_event_id: 'evt_dup',
      amount: 500,
    })
    expect(dup.duplicate).toBe(true)
    expect(dup.changed).toBe(false)

    const rows = await prisma.webhookEvent.findMany({ where: { providerEventId: 'evt_dup' } })
    expect(rows).toHaveLength(1)
    expect(rows[0].processingStatus).toBe('duplicate')
    const order = await prisma.order.findUnique({ where: { id: checkout.orderId } })
    expect(order!.paymentStatus).toBe('paid')
  })

  it('flags an amount mismatch instead of marking paid', async () => {
    const result = await signAndProcess(checkout.paymentId, {
      event: 'payment.succeeded',
      provider_event_id: 'evt_mismatch',
      amount: 499,
    })
    expect(result.flagged).toBe(true)
    expect(result.changed).toBe(false)

    const payment = await prisma.payment.findFirst({ where: { providerPaymentId: checkout.paymentId } })
    expect(payment!.amountMismatch).toBe(true)
    expect(payment!.status).toBe('pending')
    const order = await prisma.order.findUnique({ where: { id: checkout.orderId } })
    expect(order!.paymentStatus).toBe('pending')
  })

  it('flags a currency mismatch', async () => {
    const result = await signAndProcess(checkout.paymentId, {
      event: 'payment.succeeded',
      provider_event_id: 'evt_cur',
      amount: 500,
      currency: 'USD',
    })
    expect(result.flagged).toBe(true)
    const payment = await prisma.payment.findFirst({ where: { providerPaymentId: checkout.paymentId } })
    expect(payment!.amountMismatch).toBe(true)
  })

  it('handles a failure event and leaves an audit trail', async () => {
    const result = await signAndProcess(checkout.paymentId, {
      event: 'payment.failed',
      provider_event_id: 'evt_fail',
      amount: 500,
    })
    expect(result.changed).toBe(true)
    const payment = await prisma.payment.findFirst({ where: { providerPaymentId: checkout.paymentId } })
    expect(payment!.status).toBe('failed')
    const order = await prisma.order.findUnique({ where: { id: checkout.orderId } })
    expect(order!.paymentStatus).toBe('failed')

    const audit = await prisma.auditLog.findMany({ where: { action: 'payment_webhook_applied' } })
    expect(audit.length).toBeGreaterThan(0)
  })

  it('records missing payments instead of erroring the request', async () => {
    const result = await signAndProcess('mockpay_nope_does_not_exist', {
      event: 'payment.succeeded',
      provider_event_id: 'evt_nomatch',
      amount: 1,
    })
    expect(result.error).toBe('Payment not found')
    expect(result.changed).toBe(false)
    const stored = await prisma.webhookEvent.findFirst({ where: { providerEventId: 'evt_nomatch' } })
    expect(stored!.processingStatus).toBe('failed_processing')
  })
})

describe('integration: outgoing merchant webhooks', () => {
  let merchantId = ''
  let received: Array<{ path: string; body: string; signature: string | null; code: number }> = []
  let server: http.Server
  let baseUrl = ''

  beforeAll(async () => {
    merchantId = (await makeMerchant()).id
    server = http.createServer((req, res) => {
      let raw = ''
      req.on('data', c => (raw += c))
      req.on('end', () => {
        received.push({ path: req.url || '', body: raw, signature: req.headers['x-toropay-signature'] as string | null, code: 200 })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      })
    })
    await new Promise<void>(resolve => server.listen(0, resolve))
    baseUrl = `http://localhost:${(server.address() as { port: number }).port}`
  })

  afterAll(async () => {
    await new Promise(resolve => server?.close(resolve))
  })

  beforeEach(async () => {
    received = []
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE webhook_events, webhook_delivery_logs, webhook_endpoints, email_logs, email_templates, payments, order_status_history, order_items, orders, customers RESTART IDENTITY CASCADE'
    )
  })

  async function makeEndpoint(partial: Partial<{ mode: string; active: boolean; eventTypes: string[] }> = {}) {
    const secret = generateWebhookSecret()
    return prisma.webhookEndpoint.create({
      data: {
        merchantId,
        url: `${baseUrl}/wh-a`,
        secretEncrypted: secret,
        mode: (partial.mode as never) || 'test',
        active: partial.active ?? true,
        eventTypes: partial.eventTypes ?? ['*'],
      },
    })
  }

  it('delivers only to subscribed, active, matching-mode endpoints', async () => {
    const globalTest = await makeEndpoint({ mode: 'test', eventTypes: ['*'] })
    const onlyPaid = await makeEndpoint({ mode: 'test', eventTypes: ['payment.paid'] })
    const liveOnly = await makeEndpoint({ mode: 'live', eventTypes: ['*'] })
    const paused = await makeEndpoint({ mode: 'test', active: false })

    const results = await dispatchMerchantWebhook({
      merchantId,
      mode: 'test',
      eventType: 'payment.paid',
      data: { amount: 100, currency: 'INR' },
    })

    // global (all events) + onlyPaid -> 2 deliveries in test mode
    expect(results).toHaveLength(2)
    expect(received).toHaveLength(2)
    expect(received.every(r => /wh-a/.test(r.path))).toBe(true)

    const logs = await prisma.webhookDeliveryLog.findMany()
    const deliveredIds = logs.map(l => l.endpointId)
    expect(deliveredIds).toContain(globalTest.id)
    expect(deliveredIds).toContain(onlyPaid.id)
    expect(deliveredIds).not.toContain(liveOnly.id)
    expect(deliveredIds).not.toContain(paused.id)

    // signatures must be valid HMACs of the raw body with each endpoint secret
    const { signWebhook } = await import('@/lib/webhook-delivery')
    for (const log of logs) {
      const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id: log.endpointId } })
      expect(log.signature).toBe(signWebhook(log.payload, endpoint!.secretEncrypted))
    }
  })

  it('excludes endpoints whose subscriptions do not include the event', async () => {
    await makeEndpoint({ mode: 'test', eventTypes: ['order.created'] })
    const results = await dispatchMerchantWebhook({
      merchantId,
      mode: 'test',
      eventType: 'payment.failed',
      data: { error: 'card declined' },
    })
    expect(results).toHaveLength(0)
    expect(await prisma.webhookDeliveryLog.count()).toBe(0)
  })

  it('records failures and retries until success', async () => {
    let shouldFail = true
    const flaky = http.createServer((req, res) => {
      let raw = ''
      req.on('data', c => (raw += c))
      req.on('end', () => {
        if (shouldFail) {
          res.writeHead(500)
          res.end('boom')
          return
        }
        res.writeHead(200)
        res.end('ok')
      })
    })
    await new Promise<void>(resolve => flaky.listen(0, resolve))
    const flakyUrl = `http://localhost:${(flaky.address() as { port: number }).port}`

    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        merchantId,
        url: flakyUrl,
        secretEncrypted: generateWebhookSecret(),
        mode: 'test',
        eventTypes: ['*'],
      },
    })

    const [first] = await dispatchMerchantWebhook({
      merchantId,
      mode: 'test',
      eventType: 'order.created',
      data: { order_number: 'TP-1' },
    })
    expect(first.status).toBe('retrying')

    let log = await prisma.webhookDeliveryLog.findUnique({ where: { id: first.logId } })
    expect(log!.responseCode).toBe(500)
    expect(log!.retryCount).toBe(1)

    const failingEndpoint = await prisma.webhookEndpoint.findUnique({ where: { id: endpoint.id } })
    expect(failingEndpoint!.failedCount).toBe(1)

    shouldFail = false
    const status = await retryWebhookDelivery(first.logId)
    expect(status).toBe('delivered')
    log = await prisma.webhookDeliveryLog.findUnique({ where: { id: first.logId } })
    expect(log!.responseCode).toBe(200)
    const recoveredEndpoint = await prisma.webhookEndpoint.findUnique({ where: { id: endpoint.id } })
    expect(recoveredEndpoint!.failedCount).toBe(0)
    expect(recoveredEndpoint!.lastDeliveryAt).not.toBeNull()

    await new Promise(resolve => flaky.close(resolve))
  })
})