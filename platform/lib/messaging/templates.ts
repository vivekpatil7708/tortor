import { prisma } from '@/lib/prisma'
import {
  MESSAGE_EVENTS,
  SUPPORTED_MESSAGE_VARIABLES,
  defaultMessageBody,
  defaultMessageSubject,
  type MessageContext,
} from './events'

export interface ResolvedTemplate {
  name: string
  eventType: string
  subject: string
  body: string
  isActive: boolean
  isDefault: boolean
  providerTemplateName: string | null
}

const VARIABLE_REGEX = /\{\{(\w+)\}\}/g

export function renderMessageTemplate(template: string, data: Record<string, string>): string {
  return template.replace(VARIABLE_REGEX, (_, key: string) => {
    if (key in data) return data[key]
    return `{{${key}}}`
  })
}

export function getUsedVariables(template: string): string[] {
  const vars: string[] = []
  let match: RegExpExecArray | null
  const regex = new RegExp(VARIABLE_REGEX.source, 'g')
  while ((match = regex.exec(template)) !== null) {
    if (!vars.includes(match[1])) vars.push(match[1])
  }
  return vars
}

export function validateMessageTemplate(template: string): { valid: boolean; missingVars: string[]; usedVars: string[] } {
  const usedVars = getUsedVariables(template)
  const missingVars = usedVars.filter(v => !(SUPPORTED_MESSAGE_VARIABLES as readonly string[]).includes(v))
  return { valid: missingVars.length === 0, missingVars, usedVars }
}

/** Sample context for previews / test sends. */
export function sampleMessageContext(overrides: Partial<MessageContext> = {}): MessageContext {
  return {
    customer_name: 'Ravi Sharma',
    business_name: 'My Store',
    order_number: 'TP-2026-1001',
    order_id: 'TP-2026-1001',
    product_list: '  • Premium Package × 1 — ₹1,500.00',
    product_name: 'Premium Package',
    amount: '1,500.00',
    currency: 'INR',
    courier_name: 'Mock Express',
    tracking_number: 'MOCK20260001ABCDEF',
    tracking_link: 'https://mock.courier.toropay.in/track/MOCK20260001ABCDEF',
    estimated_delivery_date: '3 Oct 2026',
    support_phone: '+91-9876543210',
    support_email: 'support@mystore.com',
    payment_link: 'https://checkout.toropay.co.in/checkout/cs_sample',
    feedback_form_link: 'https://www.toropay.co.in/feedback',
    custom_note: 'We hope you love your order!',
    ...overrides,
  }
}

const CHANNELS = ['whatsapp', 'instagram'] as const
// Events the legacy email_templates system does NOT cover — seeded as message
// templates so the unified messages engine can send them via email too.
const EMAIL_ONLY_EVENTS = [
  'payment_reminder',
  'order_packed',
  'return_requested',
  'return_approved',
  'return_received',
  'refund_initiated',
  'refund_completed',
  'manual_message',
  'customer_follow_up',
  'repeat_customer_offer',
]

/**
 * Seed default message templates for a merchant on first use. Idempotent —
 * only missing (channel, name) rows are inserted.
 */
export async function ensureMessageTemplates(merchantId: string): Promise<void> {
  const rows: Array<{ merchantId: string; channel: string; name: string; eventType: string; subject: string; body: string; isDefault: boolean; isActive: boolean }> = []

  for (const eventType of Object.keys(MESSAGE_EVENTS)) {
    for (const channel of CHANNELS) {
      rows.push({
        merchantId,
        channel,
        name: eventType,
        eventType,
        subject: defaultMessageSubject(channel, eventType),
        body: defaultMessageBody(channel, eventType),
        isDefault: true,
        isActive: true,
      })
    }
    if (EMAIL_ONLY_EVENTS.includes(eventType)) {
      rows.push({
        merchantId,
        channel: 'email',
        name: eventType,
        eventType,
        subject: defaultMessageSubject('email', eventType),
        body: defaultMessageBody('email', eventType),
        isDefault: true,
        isActive: true,
      })
    }
  }

  const existing = await prisma.messageTemplate.findMany({
    where: { merchantId },
    select: { channel: true, name: true },
  })
  const seen = new Set(existing.map(r => `${r.channel}:${r.name}`))
  const toCreate = rows.filter(r => !seen.has(`${r.channel}:${r.name}`))
  if (toCreate.length) {
    await prisma.messageTemplate.createMany({ data: toCreate })
  }
}

/** Standardized list of a merchant's templates across channels. */
export async function getMessageTemplates(merchantId: string) {
  await ensureMessageTemplates(merchantId)
  return prisma.messageTemplate.findMany({
    where: { merchantId },
    orderBy: [{ channel: 'asc' }, { eventType: 'asc' }],
  })
}

export async function setMessageTemplate(params: {
  merchantId: string
  channel: string
  eventType: string
  subject?: string
  body: string
  name?: string
  isActive?: boolean
}) {
  const { merchantId, channel, eventType } = params
  const name = params.name || eventType
  const existing = await prisma.messageTemplate.findUnique({
    where: { merchantId_channel_name: { merchantId, channel, name } },
  })

  const data = {
    subject: params.subject ?? '',
    body: params.body,
    isDefault: false,
    isActive: params.isActive ?? existing?.isActive ?? true,
    eventType,
  }

  if (existing) {
    return prisma.messageTemplate.update({ where: { id: existing.id }, data })
  }
  return prisma.messageTemplate.create({
    data: { merchantId, channel, name, eventType, subject: params.subject ?? '', body: params.body, isDefault: false, isActive: params.isActive ?? true },
  })
}

/**
 * Resolve the template to use for (merchant, channel, event):
 * explicit rule template → merchant custom row → seeded merchant default →
 * built-in default. Never throws.
 */
export async function resolveMessageTemplate(params: {
  merchantId: string
  channel: string
  eventType: string
  templateId?: string | null
}): Promise<ResolvedTemplate> {
  const { merchantId, channel, eventType } = params

  if (params.templateId) {
    const t = await prisma.messageTemplate.findFirst({
      where: { id: params.templateId, merchantId, channel },
    })
    if (t) {
      return {
        name: t.name,
        eventType: t.eventType ?? eventType,
        subject: t.subject,
        body: t.body,
        isActive: t.isActive,
        isDefault: t.isDefault,
        providerTemplateName: t.providerTemplateName,
      }
    }
  }

  const custom = await prisma.messageTemplate.findFirst({
    where: { merchantId, channel, eventType, isDefault: false },
    orderBy: { updatedAt: 'desc' },
  })
  if (custom) {
    return {
      name: custom.name,
      eventType: custom.eventType ?? eventType,
      subject: custom.subject,
      body: custom.body,
      isActive: custom.isActive,
      isDefault: custom.isDefault,
      providerTemplateName: custom.providerTemplateName,
    }
  }

  const seeded = await prisma.messageTemplate.findFirst({
    where: { merchantId, channel, eventType, isDefault: true },
  })
  if (seeded) {
    return {
      name: seeded.name,
      eventType: seeded.eventType ?? eventType,
      subject: seeded.subject,
      body: seeded.body,
      isActive: seeded.isActive,
      isDefault: seeded.isDefault,
      providerTemplateName: seeded.providerTemplateName,
    }
  }

  return {
    name: eventType,
    eventType,
    subject: defaultMessageSubject(channel, eventType),
    body: defaultMessageBody(channel, eventType),
    isActive: true,
    isDefault: true,
    providerTemplateName: null,
  }
}

export const MESSAGE_EVENT_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(MESSAGE_EVENTS).map(([key, def]) => [key, def.label]),
)