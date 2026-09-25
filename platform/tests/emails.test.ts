import { describe, it, expect, beforeAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { makeMerchant } from './helpers'
import {
  ensureEmailTemplates,
  getEmailSettings,
  getEmailSetting,
  updateEmailSetting,
  sendAutomatedEmail,
  sendTestEmail,
} from '@/lib/emails/service'

describe('email automation', () => {
  let merchantId = ''

  beforeAll(async () => {
    merchantId = (await makeMerchant()).id
  })

  it('seeds default templates on first access', async () => {
    await getEmailSettings(merchantId)
    const rows = await prisma.emailTemplate.findMany({ where: { merchantId } })
    // all six automations in the enum
    expect(new Set(rows.map(r => r.key)).size).toBeGreaterThanOrEqual(6)
    expect(rows.every(r => r.isActive)).toBe(true)
  })

  it('returns default subject/body and supports overrides', async () => {
    const before = await getEmailSetting(merchantId, 'payment_received')
    // seeded templates are stored (not the implicit default), but start from defaults
    expect(before.subject).toContain('{{order_number}}')
    expect(before.default_subject).toContain('{{order_number}}')

    const updated = await updateEmailSetting({
      merchantId,
      key: 'payment_received',
      subject: 'Payment received for {{order_number}}',
      body: 'Hi {{customer_name}}, we got your payment of {{currency}} {{amount}}.',
    })
    expect(updated.is_default).toBe(false)
    expect(updated.subject).toContain('Payment received')
    expect(updated.default_subject).toContain('{{order_number}}')
  })

  it('renders variables into the final email body', async () => {
    const result = await sendAutomatedEmail({
      merchantId,
      key: 'payment_received',
      to: 'buyer@test.dev',
      context: { customer_name: 'Amit', order_number: 'TP-999', amount: '250.00', currency: 'INR' },
    })
    expect(result).not.toBeNull()
    const rows = await prisma.emailLog.findMany({ where: { recipient: 'buyer@test.dev' } })
    const row = rows.find(r => r.templateKey === 'payment_received')
    expect(row).toBeDefined()
    expect(row!.status).toBe('sent')
    expect(row!.subject).toContain('TP-999')
    expect(row!.renderedBody).toContain('Amit')
    expect(row!.renderedBody).toContain('250.00')
  })

  it('skips sending when a template is disabled', async () => {
    await updateEmailSetting({ merchantId, key: 'payment_failed', isActive: false })
    const result = await sendAutomatedEmail({ merchantId, key: 'payment_failed', to: 'x@test.dev' })
    expect(result).toBeNull()
    expect(await prisma.emailLog.count({ where: { templateKey: 'payment_failed' } })).toBe(0)
    await updateEmailSetting({ merchantId, key: 'payment_failed', isActive: true })
  })

  it('queues a customer email using the mock provider without network', async () => {
    await ensureEmailTemplates(merchantId)
    const result = await sendAutomatedEmail({ merchantId, key: 'order_confirmed', to: 'a@test.dev' })
    expect(result!.status).toBe('sent')
    const log = await prisma.emailLog.findFirst({ where: { templateKey: 'order_confirmed', recipient: 'a@test.dev' } })
    expect(log!.provider).toBe('mock')
  })

  it('tests render sample data end-to-end', async () => {
    const { status, subject } = await sendTestEmail(merchantId, 'payment_received', 'sample@test.dev')
    expect(status).toBe('sent')
    expect(subject).toBeTruthy()
  })
})