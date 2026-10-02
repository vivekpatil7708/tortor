import { prisma } from '@/lib/prisma'
import { MESSAGE_EVENTS } from './events'
import { MESSAGE_EVENT_LABELS, ensureMessageTemplates } from './templates'

export interface AutomationRuleView {
  id: string
  eventType: string
  eventLabel: string
  channel: string
  templateId: string | null
  enabled: boolean
  delayMinutes: number
  conditions?: unknown
}

/**
 * Seed automation rules for every supported event × channel. Rules default to
 * DISABLED — the merchant explicitly opts in per event/channel from the
 * Messages → Automations tab. Idempotent.
 */
export async function ensureAutomationRules(merchantId: string): Promise<void> {
  await ensureMessageTemplates(merchantId)
  const events = Object.keys(MESSAGE_EVENTS)
  const channels = ['whatsapp', 'instagram'] as const

  const existing = await prisma.automationRule.findMany({
    where: { merchantId },
    select: { eventType: true, channel: true },
  })
  const seen = new Set(existing.map(r => `${r.eventType}:${r.channel}`))

  const rows: Array<{ merchantId: string; eventType: string; channel: string; enabled: boolean; delayMinutes: number }> = []
  for (const eventType of events) {
    for (const channel of channels) {
      if (seen.has(`${eventType}:${channel}`)) continue
      rows.push({ merchantId, eventType, channel, enabled: false, delayMinutes: 0 })
    }
    // Email rules are mirrored for events the legacy email system does NOT send.
    if (['payment_reminder', 'order_packed', 'return_requested', 'return_approved', 'return_received', 'refund_initiated', 'refund_completed', 'manual_message', 'customer_follow_up', 'repeat_customer_offer'].includes(eventType)) {
      if (!seen.has(`${eventType}:email`)) {
        rows.push({ merchantId, eventType, channel: 'email', enabled: false, delayMinutes: 0 })
      }
    }
  }
  if (rows.length) {
    await prisma.automationRule.createMany({ data: rows })
  }
}

export async function getAutomationRules(merchantId: string): Promise<AutomationRuleView[]> {
  await ensureAutomationRules(merchantId)
  const rules = await prisma.automationRule.findMany({
    where: { merchantId },
    orderBy: [{ eventType: 'asc' }, { channel: 'asc' }],
  })
  return rules.map(r => ({
    id: r.id,
    eventType: r.eventType,
    eventLabel: MESSAGE_EVENT_LABELS[r.eventType] ?? r.eventType,
    channel: r.channel,
    templateId: r.templateId,
    enabled: r.enabled,
    delayMinutes: r.delayMinutes,
    conditions: r.conditions,
  }))
}

export async function setAutomationRule(params: {
  merchantId: string
  eventType: string
  channel: string
  enabled?: boolean
  delayMinutes?: number
  templateId?: string | null
  conditions?: unknown
}) {
  const { merchantId, eventType, channel } = params
  const existing = await prisma.automationRule.findUnique({
    where: { merchantId_eventType_channel: { merchantId, eventType, channel } },
  })

  const data: Record<string, unknown> = {}
  if (params.enabled !== undefined) data.enabled = params.enabled
  if (params.delayMinutes !== undefined) data.delayMinutes = params.delayMinutes
  if (params.templateId !== undefined) data.templateId = params.templateId
  if (params.conditions !== undefined) data.conditions = params.conditions

  if (existing) {
    return prisma.automationRule.update({ where: { id: existing.id }, data })
  }
  return prisma.automationRule.create({
    data: {
      merchantId,
      eventType,
      channel,
      enabled: params.enabled ?? false,
      delayMinutes: params.delayMinutes ?? 0,
      templateId: params.templateId ?? null,
      conditions: (params.conditions as object | undefined) ?? {},
    },
  })
}