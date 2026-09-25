import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { makeMerchant, makeCustomer } from './helpers'
import { sendMessage, triggerMessageAutomations } from '@/lib/messaging/engine'
import { getMockMessages, clearMockMessages } from '@/lib/messaging/mock'
import { ensureMessageTemplates, setMessageTemplate, validateMessageTemplate } from '@/lib/messaging/templates'
import { saveChannelConnection, getChannelsStatus, disconnectChannel, getChannelCredentials } from '@/lib/messaging/connections'
import { ensureAutomationRules, getAutomationRules, setAutomationRule } from '@/lib/messaging/automations'
import { getMessageLogs, handleDeliveryReceipt, retryFailedMessage, markMessageLog } from '@/lib/messaging/logs'

const TRUNCATE =
  'message_logs, message_templates, automation_rules, channel_connections, follow_up_tasks, orders, customers, audit_logs'

describe('integration: messaging engine (Phase 4)', () => {
  let merchantId = ''

  beforeAll(async () => {
    const m = await makeMerchant()
    merchantId = m.id
    await ensureMessageTemplates(merchantId)
  })

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TRUNCATE} RESTART IDENTITY CASCADE`)
    clearMockMessages()
  })

  it('sends via the mock provider without network and records a sent log', async () => {
    const result = await sendMessage({
      merchantId,
      channel: 'whatsapp',
      eventType: 'order_packed',
      to: '919999999999',
      context: { order_number: 'TP-2026-1001', customer_name: 'Amit' },
      idempotencyKey: 't1',
    })

    expect(result.status).not.toBe('failed')
    expect(getMockMessages().length).toBe(1)
    expect(getMockMessages()[0].body).toContain('TP-2026-1001')

    const { logs } = await getMessageLogs(merchantId)
    expect(logs).toHaveLength(1)
    expect(logs[0].status).not.toBe('failed')
    expect(logs[0].eventType).toBe('order_packed')
    expect(logs[0].recipient).toBe('919999999999')
  })

  it('dedupes on (merchant, channel, idempotencyKey) without creating duplicate logs', async () => {
    const key = 'dedupe-1'
    const first = await sendMessage({ merchantId, channel: 'whatsapp', eventType: 'payment_received', to: '919999999999', idempotencyKey: key })
    expect(first.status).not.toBe('duplicate')

    const second = await sendMessage({ merchantId, channel: 'whatsapp', eventType: 'payment_received', to: '919999999999', idempotencyKey: key })
    expect(second.status).toBe('duplicate')

    const logs = await prisma.messageLog.count({ where: { merchantId, idempotencyKey: key } })
    expect(logs).toBe(1)
    expect(getMockMessages().length).toBe(1)
  })

  it('skips promotional sends when the customer has not opted into marketing', async () => {
    const customer = await makeCustomer(merchantId, { marketingConsent: false })
    const result = await sendMessage({
      merchantId,
      channel: 'whatsapp',
      eventType: 'repeat_customer_offer',
      to: '919999999999',
      customerId: customer.id,
      idempotencyKey: 'consent-1',
    })

    expect(result.status).toBe('skipped')
    expect(result.reason).toBe('no_marketing_consent')
    expect(getMockMessages().length).toBe(0)
  })

  it('stores encrypted channel credentials and applies delivery receipts to message logs', async () => {
    const result = await sendMessage({
      merchantId,
      channel: 'whatsapp',
      eventType: 'shipment_created',
      to: '919999999999',
      context: { tracking_number: 'MOCK1' },
      idempotencyKey: 'rec-1',
    })
    expect(result.status).not.toBe('failed')
    const msg = getMockMessages()[0]

    await saveChannelConnection({
      merchantId,
      channel: 'whatsapp',
      credentials: { accessToken: 'tok_abc', phoneNumberId: '1029384756' },
      webhookSecret: 'whsec_test',
    })

    const status = await getChannelsStatus(merchantId)
    const wa = status.find(s => s.channel === 'whatsapp')!
    expect(wa.connected).toBe(true)
    expect(wa.hasCredentials).toBe(true)
    expect(status.some(s => JSON.stringify(s).includes('tok_abc'))).toBe(false)

    const creds = await getChannelCredentials(merchantId, 'whatsapp')
    expect(creds.credentials?.accessToken).toBe('tok_abc')
    const stored = await prisma.channelConnection.findUnique({ where: { merchantId_channel: { merchantId, channel: 'whatsapp' } } })
    expect(JSON.stringify(stored!.credentialsEncrypted)).not.toContain('tok_abc')

    await handleDeliveryReceipt(merchantId, 'whatsapp', msg.providerMessageId, { delivered: true })
    const log = await prisma.messageLog.findUnique({ where: { id: result.logId! } })
    expect(log!.status).toBe('delivered')

    await disconnectChannel(merchantId, 'whatsapp')
    expect((await getChannelsStatus(merchantId)).find(s => s.channel === 'whatsapp')!.connected).toBe(false)
  })

  it('automation rules are seeded disabled, opt-in fires sends, and failed logs can be retried', async () => {
    await ensureAutomationRules(merchantId)
    const rules = await getAutomationRules(merchantId)
    expect(rules.length).toBeGreaterThan(0)
    expect(rules.every(r => !r.enabled)).toBe(true)

    const silent = await triggerMessageAutomations({ merchantId, eventType: 'order_packed', to: 'test@dev.in', channels: ['email'] })
    expect(silent.initialized).toBe(false)

    const template = await setMessageTemplate({
      merchantId,
      channel: 'email',
      eventType: 'order_packed',
      name: 'order_packed',
      subject: '',
      body: 'Your order {{order_number}} is packed',
      isActive: true,
    })
    expect(validateMessageTemplate(template.body).valid).toBe(true)

    await setAutomationRule({ merchantId, eventType: 'order_packed', channel: 'email', enabled: true, templateId: template.id })
    const fired = await triggerMessageAutomations({
      merchantId,
      eventType: 'order_packed',
      to: 'test@dev.in',
      idempotencyKey: 'auto-1',
      channels: ['email'],
    })
    expect(fired.initialized).toBe(true)

    const rows = await prisma.messageLog.findMany({ where: { merchantId, eventType: 'order_packed' } })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].status).not.toBe('failed')

    // Retry path on a failed row.
    await markMessageLog(rows[0].id, { status: 'failed', failureReason: 'simulated' })
    const retried = await retryFailedMessage(rows[0].id, merchantId)
    expect(retried.ok).toBe(true)
    const after = await prisma.messageLog.findUnique({ where: { id: rows[0].id } })
    expect(after!.status).toBe('queued')
  })
})