import { prisma } from '@/lib/prisma'
import { isPromotionalEvent, type MessageContext } from './events'
import { resolveMessageTemplate, renderMessageTemplate } from './templates'
import { getChannelCredentials } from './connections'
import {
  logMessageRow,
  markMessageLog,
  DONE_STATUSES,
  type MessageLogStatus,
} from './logs'
import { getMessagingProvider, mockMessagingAllowed, type ChannelCredentials } from './provider'
import type { MessagingChannel } from './events'

export interface SendMessageParams {
  merchantId: string
  channel: string
  eventType: string
  to: string
  context?: Partial<MessageContext>
  idempotencyKey?: string | null
  templateId?: string | null
  orderId?: string | null
  customerId?: string | null
  fulfillmentId?: string | null
  packageId?: string | null
  mediaUrl?: string | null
  createdBy?: string
  delayMinutes?: number
}

export type ChannelDispatchStatus = 'sent' | 'queued' | 'skipped' | 'duplicate' | 'failed'

export interface ChannelDispatchResult {
  channel: string
  status: ChannelDispatchStatus
  reason?: string
  logId?: string
}

export interface TriggerResult {
  initialized: boolean
  results: ChannelDispatchResult[]
}

const SYSTEM = 'system'

/** Consent + opt-out checks for promotional sends. */
async function canSendToCustomer(params: {
  merchantId: string
  customerId: string | null | undefined
  channel: string
  eventType: string
}): Promise<{ ok: boolean; reason?: string }> {
  const { merchantId, customerId, channel, eventType } = params
  if (isPromotionalEvent(eventType)) {
    if (!customerId) return { ok: false, reason: 'no_customer_consent' }
    const customer = await prisma.customer.findFirst({ where: { id: customerId, merchantId } })
    if (!customer) return { ok: false, reason: 'no_customer_consent' }
    if (!customer.marketingConsent) return { ok: false, reason: 'no_marketing_consent' }
    const optedOut = Array.isArray(customer.optedOutChannels) ? (customer.optedOutChannels as string[]) : []
    if (optedOut.includes(channel)) return { ok: false, reason: 'opted_out' }
  }
  return { ok: true }
}

/**
 * Send a message immediately (or queue it when delayMinutes > 0).
 * Dedupes on (merchant, channel, idempotencyKey): already-delivered keys are
 * skipped; previously-failed keys reuse the same log row so retries never
 * create duplicates.
 */
export async function sendMessage(params: SendMessageParams): Promise<ChannelDispatchResult> {
  const {
    merchantId,
    channel,
    eventType,
    context = {},
    createdBy = SYSTEM,
    delayMinutes = 0,
  } = params

  const template = await resolveMessageTemplate({
    merchantId,
    channel,
    eventType,
    templateId: params.templateId,
  })
  if (!template.isActive) {
    return { channel, status: 'skipped', reason: 'template_disabled' }
  }

  const consent = await canSendToCustomer({
    merchantId,
    customerId: params.customerId,
    channel,
    eventType,
  })
  if (!consent.ok) {
    return { channel, status: 'skipped', reason: consent.reason }
  }

  // ---- dedupe ---------------------------------------------------------------
  let logId: string | null = null
  let duplicate = false
  if (params.idempotencyKey) {
    const existing = await prisma.messageLog.findFirst({
      where: { merchantId, channel, idempotencyKey: params.idempotencyKey },
    })
    if (existing) {
      if (DONE_STATUSES.includes(existing.status as MessageLogStatus)) {
        return { channel, status: 'duplicate', reason: 'already_handled', logId: existing.id }
      }
      if (existing.status === 'failed') {
        await markMessageLog(existing.id, { status: 'queued', failureReason: null, errorMessage: null })
        logId = existing.id
      } else {
        // Already queued / in-flight with the same key — treat as duplicate.
        return { channel, status: 'duplicate', reason: 'already_queued', logId: existing.id }
      }
    }
  }

  const providerName = getMessagingProvider(channel as MessagingChannel).name
  if (!logId) {
    const created = await logMessageRow({
      merchantId,
      orderId: params.orderId ?? null,
      customerId: params.customerId ?? null,
      fulfillmentId: params.fulfillmentId ?? null,
      packageId: params.packageId ?? null,
      channel,
      eventType,
      recipient: params.to,
      subject: template.subject,
      body: renderMessageTemplate(template.body, context as Record<string, string>),
      provider: providerName,
      createdBy,
      idempotencyKey: params.idempotencyKey,
      status: 'queued',
    })
    logId = created.logId
    duplicate = created.duplicate
    if (duplicate) return { channel, status: 'duplicate', reason: 'already_handled', logId }
  }

  if (delayMinutes > 0) {
    const scheduledAt = new Date(Date.now() + delayMinutes * 60_000)
    await markMessageLog(logId, {
      status: 'queued',
      failureReason: `delayed:${delayMinutes}min`,
    })
    await prisma.messageLog.update({
      where: { id: logId },
      data: { scheduledAt },
    })
    return { channel, status: 'queued', reason: `scheduled_in_${delayMinutes}min`, logId }
  }

  return dispatchLog(merchantId, logId)
}

/**
 * Actually dispatch a stored queued log row to the provider and update its
 * state. Used both for immediate sends and for draining delayed messages.
 */
export async function dispatchLog(merchantId: string, logId: string): Promise<ChannelDispatchResult> {
  const log = await prisma.messageLog.findFirst({ where: { id: logId, merchantId } })
  if (!log) return { channel: 'email', status: 'failed', reason: 'log_not_found' }

  const channel = log.channel
  let credentials: Partial<ChannelCredentials> | null = null
  if (channel === 'whatsapp' || channel === 'instagram') {
    credentials = (await getChannelCredentials(merchantId, channel as 'whatsapp' | 'instagram')).credentials
  }

  const provider = getMessagingProvider(channel as MessagingChannel, credentials)
  // A disconnected WhatsApp/Instagram channel falls back to the mock provider
  // in dev/tests, but must not silently "deliver" in production.
  if (channel !== 'email' && provider.name === 'mock-messaging' && !mockMessagingAllowed()) {
    await markMessageLog(log.id, { status: 'failed', failureReason: 'channel_not_connected', errorMessage: 'Channel is not connected' })
    return { channel, status: 'failed', reason: 'channel_not_connected' }
  }

  const config = provider.validateConfiguration(credentials)
  if (!config.ok) {
    await markMessageLog(log.id, { status: 'failed', failureReason: config.error, errorMessage: config.error })
    return { channel, status: 'failed', reason: config.error }
  }

  const result = await provider.sendMessage({
    to: log.recipient,
    subject: channel === 'email' ? log.subject : null,
    body: log.renderedBody,
    metadata: { toropay_log_id: log.id, event_type: log.eventType },
  })

  if (result.ok) {
    const status: MessageLogStatus = result.status === 'delivered' ? 'delivered' : 'sent'
    await markMessageLog(log.id, {
      status,
      providerMessageId: result.providerMessageId,
      failureReason: null,
      errorMessage: null,
      sentAt: new Date(),
    })
    return { channel, status: status === 'delivered' ? 'sent' : status, logId: log.id }
  }

  await markMessageLog(log.id, {
    status: 'failed',
    failureReason: result.error ?? 'provider_failure',
    errorMessage: result.error ?? null,
  })
  return { channel, status: 'failed', reason: result.error ?? 'provider_failure', logId: log.id }
}

/**
 * Fire all enabled automation rules for a business event. Mirrors the legacy
 * email path where an equivalent EmailAutomation exists (cheap consistency).
 */
export async function triggerMessageAutomations(params: {
  merchantId: string
  eventType: string
  idempotencyKey?: string | null
  to: string
  context?: Partial<MessageContext>
  orderId?: string | null
  customerId?: string | null
  fulfillmentId?: string | null
  packageId?: string | null
  channels?: string[]
}): Promise<TriggerResult> {
  const { merchantId, eventType } = params

  const rules = await prisma.automationRule.findMany({
    where: { merchantId, eventType, enabled: true },
  })
  if (!rules.length) return { initialized: false, results: [] }

  const channels = params.channels ?? ['email', 'whatsapp', 'instagram']
  const results: ChannelDispatchResult[] = []

  for (const channel of channels) {
    const rule = rules.find(r => r.channel === channel)
    if (!rule) continue

    if (channel === 'whatsapp') {
      const saved = await getChannelCredentials(merchantId, 'whatsapp')
      if (!saved.credentials) {
        results.push({ channel, status: 'skipped', reason: 'channel_not_connected' })
        continue
      }
    }
    if (channel === 'instagram') {
      results.push({ channel, status: 'skipped', reason: 'instagram_optional_disabled' })
      continue
    }

    const result = await sendMessage({
      merchantId,
      channel,
      eventType,
      to: params.to,
      context: params.context,
      idempotencyKey: params.idempotencyKey,
      templateId: rule.templateId,
      orderId: params.orderId,
      customerId: params.customerId,
      fulfillmentId: params.fulfillmentId,
      packageId: params.packageId,
      delayMinutes: rule.delayMinutes,
    })
    results.push(result)
  }

  return { initialized: true, results }
}

/** Drain queued (delayed) messages whose scheduled time has passed. */
export async function drainDelayedMessages(merchantId: string, limit = 25): Promise<{ drained: number; results: ChannelDispatchResult[] }> {
  const due = await prisma.messageLog.findMany({
    where: { merchantId, status: 'queued', scheduledAt: { lte: new Date() } },
    orderBy: { scheduledAt: 'asc' },
    take: limit,
  })
  const results: ChannelDispatchResult[] = []
  for (const log of due) {
    results.push(await dispatchLog(merchantId, log.id))
  }
  return { drained: due.length, results }
}