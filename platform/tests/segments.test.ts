import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { makeMerchant, makeCustomer } from './helpers'
import { buildCustomerWhere, evaluateSegment, saveSegmentPreset, listSegmentPresets, messageSegment, type SegmentPreset } from '@/lib/segments'
import { clearMockMessages } from '@/lib/messaging/mock'

const TRUNCATE = 'customers, merchant_settings, message_logs, message_templates, audit_logs'

describe('integration: customer segments (Phase 4)', () => {
  let merchantId = ''

  beforeAll(async () => {
    merchantId = (await makeMerchant()).id
  })

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TRUNCATE} RESTART IDENTITY CASCADE`)
    clearMockMessages()
  })

  const vipPreset: SegmentPreset = {
    id: 'vip',
    name: 'VIP buyers',
    match: 'all',
    rules: [{ field: 'total_spent', operator: 'gte', value: 500 }, { field: 'marketing_consent', operator: 'eq', value: true }],
  }

  it('persists presets, evaluates members, and messages only consented customers', async () => {
    await saveSegmentPreset(merchantId, vipPreset)
    const saved = await listSegmentPresets(merchantId)
    expect(saved).toHaveLength(1)
    expect(saved[0].rules).toHaveLength(2)
    expect(buildCustomerWhere(vipPreset.rules, vipPreset.match).AND).toBeDefined()

    const optedIn = await makeCustomer(merchantId, { totalSpent: 1200, marketingConsent: true })
    const optedOut = await makeCustomer(merchantId, { totalSpent: 900, marketingConsent: true, optedOutChannels: ['whatsapp'] })
    const noConsent = await makeCustomer(merchantId, { totalSpent: 700, marketingConsent: false })

    const evaluation = await evaluateSegment(merchantId, vipPreset)
    expect(evaluation.total).toBe(2)
    expect(evaluation.customerIds).not.toContain(noConsent.id)

    const result = await messageSegment({ merchantId, preset: vipPreset, channel: 'whatsapp' })
    expect(result.total).toBe(2)
    expect(result.sent).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.failed).toBe(0)

    const logs = await prisma.messageLog.findMany({ where: { merchantId } })
    expect(logs.map(l => l.customerId)).toEqual([optedIn.id])
  })

  it('includeOptedOut bypasses the channel opt-out at send time', async () => {
    await saveSegmentPreset(merchantId, vipPreset)
    await makeCustomer(merchantId, { totalSpent: 900, marketingConsent: true, optedOutChannels: ['whatsapp'] })

    const result = await messageSegment({ merchantId, preset: vipPreset, channel: 'whatsapp', includeOptedOut: true })
    expect(result.sent).toBe(1)
    expect(result.skipped).toBe(0)
  })
})