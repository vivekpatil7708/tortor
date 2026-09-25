import crypto from 'crypto'
import { nanoid } from 'nanoid'
import { prisma } from '@/lib/prisma'
import type { KeyMode, WebhookDeliveryStatus } from '@prisma/client'

export const OUTGOING_WEBHOOK_EVENTS = [
  'order.created',
  'order.paid',
  'order.updated',
  'payment.paid',
  'payment.failed',
  'fulfillment.created',
  'fulfillment.shipped',
  'fulfillment.delivered',
] as const

export function generateWebhookEventId(): string {
  return `evt_${nanoid(20)}`
}

export function generateWebhookSecret(): string {
  return `whsec_${nanoid(32)}`
}

export function signWebhook(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

export interface WebhookDispatchData {
  [key: string]: unknown
}

const RETRY_DELAY_MS = [0, 60_000, 300_000, 900_000, 3_600_000, 14_400_000]

export function nextRetryDelay(attempt: number): number {
  return RETRY_DELAY_MS[Math.min(attempt, RETRY_DELAY_MS.length - 1)]
}

function buildPayload(eventType: string, data: WebhookDispatchData) {
  return {
    id: generateWebhookEventId(),
    type: eventType,
    created_at: new Date().toISOString(),
    data,
  }
}

function isSubscribed(events: unknown, eventType: string): boolean {
  let list: string[] = []
  if (Array.isArray(events)) {
    list = events
  } else if (typeof events === 'string') {
    try {
      list = JSON.parse(events) as string[]
    } catch {
      list = []
    }
  }
  return list.includes(eventType) || list.includes('*')
}

/**
 * Deliver a webhook event to every active endpoint subscribed to `eventType`
 * for the merchant, scoped to the payment/order mode. Each delivery is logged
 * and signed with the endpoint's secret.
 */
export async function dispatchMerchantWebhook(params: {
  merchantId: string
  mode: KeyMode
  eventType: string
  data: WebhookDispatchData
}): Promise<Array<{ logId: string; status: string }>> {
  const { merchantId, mode, eventType, data } = params

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { merchantId, active: true, mode },
  })

  if (!endpoints.length) return []

  const payload = buildPayload(eventType, data)
  const body = JSON.stringify(payload)
  const results: Array<{ logId: string; status: string }> = []

  for (const endpoint of endpoints) {
    if (!isSubscribed(endpoint.eventTypes, eventType)) continue

    const signature = signWebhook(body, endpoint.secretEncrypted)

    const log = await prisma.webhookDeliveryLog.create({
      data: {
        endpointId: endpoint.id,
        merchantId,
        eventId: payload.id,
        eventType,
        url: endpoint.url,
        payload: body,
        signature,
        status: 'pending',
      },
    })

    const delivered = await attemptDelivery(log.id, endpoint.id, endpoint.url, body, signature)
    results.push({ logId: log.id, status: delivered.status })
  }

  return results
}

async function attemptDelivery(
  logId: string,
  endpointId: string,
  url: string,
  body: string,
  signature: string
): Promise<{ status: WebhookDeliveryStatus }> {
  let status: WebhookDeliveryStatus = 'delivered'
  let responseCode: number | null = null
  let responseBody: string | null = null
  let errorMessage: string | null = null
  let retryCount = 0
  let nextRetryAt: Date | null = null

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ToroPay-Webhooks/1.0',
        'X-ToroPay-Event': '',
        'X-ToroPay-Signature': signature,
      },
      body,
      signal: AbortSignal.timeout(10000),
    })
    responseCode = res.status
    responseBody = (await res.text().catch(() => '')).slice(0, 2000)
    if (res.ok) {
      status = 'delivered'
    } else {
      retryCount = 1
      status = 'retrying'
      nextRetryAt = new Date(Date.now() + nextRetryDelay(1))
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : 'Delivery failed'
    retryCount = 1
    status = 'retrying'
    nextRetryAt = new Date(Date.now() + nextRetryDelay(1))
  }

  await prisma.webhookDeliveryLog.update({
    where: { id: logId },
    data: {
      status,
      responseCode,
      responseBody,
      errorMessage,
      retryCount,
      nextRetryAt,
      deliveredAt: status === 'delivered' ? new Date() : null,
    },
  })

  if (status !== 'delivered') {
    await prisma.webhookEndpoint.update({
      where: { id: endpointId },
      data: { failedCount: { increment: 1 }, lastDeliveryAt: new Date() },
    })
  } else {
    await prisma.webhookEndpoint.update({
      where: { id: endpointId },
      data: { failedCount: 0, lastDeliveryAt: new Date() },
    })
  }

  return { status }
}

/** Attempt a retry for a previously failed/retrying delivery (manual or cron). */
export async function retryWebhookDelivery(logId: string): Promise<WebhookDeliveryStatus | null> {
  const log = await prisma.webhookDeliveryLog.findUnique({ where: { id: logId } })
  if (!log || !['failed', 'retrying', 'pending'].includes(log.status)) return null

  const retried = await attemptDelivery(logId, log.endpointId, log.url, log.payload, log.signature)
  if (retried.status === 'retrying') {
    await prisma.webhookDeliveryLog.update({
      where: { id: logId },
      data: { retryCount: { increment: 1 } },
    })
  }
  return retried.status
}

/** Find deliveries due for retry and re-attempt them. Returns number retried. */
export async function processDueWebhookRetries(): Promise<number> {
  const due = await prisma.webhookDeliveryLog.findMany({
    where: {
      status: { in: ['retrying', 'failed', 'pending'] },
      nextRetryAt: { lte: new Date() },
      retryCount: { lt: 10 },
    },
    take: 100,
  })
  let attempted = 0
  for (const log of due) {
    await retryWebhookDelivery(log.id)
    attempted += 1
  }
  return attempted
}

/** Send a sample event to an endpoint from the dashboard webhook settings. */
export async function sendTestWebhook(endpointId: string, merchantId: string): Promise<{ success: boolean; logId?: string }> {
  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id: endpointId, merchantId } })
  if (!endpoint) return { success: false }

  const payload = buildPayload('order.created', {
    order_id: 'tp_order_sample',
    order_number: 'TP-2026-0001',
    payment_status: 'pending',
    amount: 1499,
    currency: 'INR',
  })
  const body = JSON.stringify(payload)
  const signature = signWebhook(body, endpoint.secretEncrypted)

  const log = await prisma.webhookDeliveryLog.create({
    data: {
      endpointId: endpoint.id,
      merchantId,
      eventId: payload.id,
      eventType: 'order.created',
      url: endpoint.url,
      payload: body,
      signature,
      status: 'pending',
    },
  })
  const delivered = await attemptDelivery(log.id, endpoint.id, endpoint.url, body, signature)
  return { success: delivered.status === 'delivered', logId: log.id }
}