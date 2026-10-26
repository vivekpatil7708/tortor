import crypto from 'crypto'
import { nanoid } from 'nanoid'
import { prisma } from '@/lib/prisma'
import { postWebhook, UnsafeWebhookUrlError } from '@/lib/safe-fetch'
import { nextWebhookAttemptAt, retryWindowStart } from '@/lib/webhook-retry'
import type { KeyMode, WebhookDeliveryStatus } from '@prisma/client'
import type { WebhookEvent } from './webhook-events'

export { OUTGOING_WEBHOOK_EVENTS } from './webhook-events'

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

    const delivered = await attemptDelivery({
      logId: log.id,
      endpointId: endpoint.id,
      url: endpoint.url,
      body,
      signature,
      eventType,
      failedSoFar: 0,
      retry: true,
    })
    results.push({ logId: log.id, status: delivered.status })
  }

  return results
}

async function attemptDelivery(params: {
  logId: string
  endpointId: string
  url: string
  body: string
  signature: string
  eventType: string
  /** Failed attempts before this one. */
  failedSoFar: number
  /** False for one-off sends (dashboard test events) that shouldn't be retried. */
  retry: boolean
}): Promise<{ status: WebhookDeliveryStatus }> {
  const { logId, endpointId, url, body, signature, eventType, failedSoFar, retry } = params
  let status: WebhookDeliveryStatus = 'delivered'
  let responseCode: number | null = null
  let responseBody: string | null = null
  let errorMessage: string | null = null
  let retryCount = failedSoFar
  let nextRetryAt: Date | null = null

  try {
    const res = await postWebhook(url, {
      headers: {
        'Content-Type': 'application/json',
        'X-ToroPay-Event': eventType,
        'X-ToroPay-Signature': signature,
      },
      body,
    })
    responseCode = res.status
    responseBody = res.body
    if (!res.ok) {
      retryCount = failedSoFar + 1
      nextRetryAt = retry ? nextWebhookAttemptAt(retryCount) : null
      status = nextRetryAt ? 'retrying' : 'failed'
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : 'Delivery failed'
    retryCount = failedSoFar + 1
    // A private or invalid address will never work, so it isn't retried.
    nextRetryAt = retry && !(err instanceof UnsafeWebhookUrlError) ? nextWebhookAttemptAt(retryCount) : null
    status = nextRetryAt ? 'retrying' : 'failed'
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

  // The merchant switched this endpoint off: stop retrying.
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id: log.endpointId }, select: { active: true } })
  if (!endpoint?.active) {
    await prisma.webhookDeliveryLog.update({ where: { id: logId }, data: { status: 'disabled', nextRetryAt: null } })
    return 'disabled'
  }

  const retried = await attemptDelivery({
    logId,
    endpointId: log.endpointId,
    url: log.url,
    body: log.payload,
    signature: log.signature,
    eventType: log.eventType,
    failedSoFar: log.retryCount,
    retry: true,
  })
  return retried.status
}

/** Re-attempt deliveries whose retry time has come (run by /api/cron/webhook-retries). Returns how many were attempted. */
export async function processDueWebhookRetries({ deadline = Infinity, limit = 25 } = {}): Promise<number> {
  const due = await prisma.webhookDeliveryLog.findMany({
    where: { status: 'retrying', nextRetryAt: { lte: new Date(), gte: retryWindowStart() } },
    orderBy: { nextRetryAt: 'asc' },
    take: limit,
  })
  let attempted = 0
  for (const log of due) {
    if (Date.now() > deadline) break
    // Claim it by pushing the retry time out, so an overlapping run skips it.
    const claimed = await prisma.webhookDeliveryLog.updateMany({
      where: { id: log.id, status: 'retrying', nextRetryAt: log.nextRetryAt },
      data: { nextRetryAt: new Date(Date.now() + 10 * 60_000) },
    })
    if (claimed.count !== 1) continue
    await retryWebhookDelivery(log.id)
    attempted += 1
  }
  return attempted
}

/** Sample data for the dashboard's "Send test event" action. */
function testWebhookData(eventType: WebhookEvent): WebhookDispatchData {
  const sample = {
    order_id: 'tp_order_sample',
    order_number: 'TP-2026-0001',
    payment_status: 'paid',
    amount: 1499,
    currency: 'INR',
    customer_name: 'Asha Rao',
    customer_phone: '9876543210',
    customer_email: 'asha@example.com',
  }

  switch (eventType) {
    case 'payment.confirmed':
    case 'payment.rejected':
      return {
        transaction_id: 'txn_sample',
        txn_id: 'TP-TXN-SAMPLE',
        amount: 1499,
        status: eventType === 'payment.confirmed' ? 'success' : 'failed',
        customer_name: 'Asha Rao',
        customer_phone: '9876543210',
        payment_app: 'Google Pay',
        link_title: 'Sample payment',
      }
    case 'payment_link.created':
      return {
        link_id: 'pl_sample',
        title: 'Sample payment',
        slug: 'sample-payment',
        link_url: 'https://checkout.toropay.co.in/pay/sample-payment',
        amount: 1499,
        amount_flexible: false,
        upi_id: 'sample@upi',
      }
    case 'customer.created':
      return {
        customer_id: 'cus_sample',
        full_name: 'Asha Rao',
        email: 'asha@example.com',
        phone: '9876543210',
      }
    case 'order.updated':
      return {
        order_id: sample.order_id,
        order_number: sample.order_number,
        status: 'processing',
        previous_status: 'new',
      }
    case 'payment.paid':
    case 'payment.failed':
      return {
        ...sample,
        payment_id: 'pay_sample',
        payment_status: eventType === 'payment.paid' ? 'paid' : 'failed',
      }
    case 'fulfillment.created':
      return { fulfillment_id: 'ful_sample', order_id: sample.order_id, status: 'created' }
    case 'fulfillment.shipped':
      return { fulfillment_id: 'ful_sample', order_id: sample.order_id, status: 'shipped', tracking_number: 'AWB123456' }
    case 'fulfillment.delivered':
      return { fulfillment_id: 'ful_sample', order_id: sample.order_id, status: 'delivered' }
    case 'order.paid':
      return { ...sample }
    case 'order.created':
    default:
      return {
        ...sample,
        payment_status: 'pending',
        items: [{ name: 'Sample product', quantity: 1, unit_price: 1499 }],
      }
  }
}

/** Send a sample event to an endpoint from the dashboard webhook settings. */
export async function sendTestWebhook(
  endpointId: string,
  merchantId: string,
  eventType: WebhookEvent = 'order.created',
): Promise<{ success: boolean; logId?: string }> {
  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id: endpointId, merchantId } })
  if (!endpoint) return { success: false }

  const payload = buildPayload(eventType, testWebhookData(eventType))
  const body = JSON.stringify(payload)
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
  const delivered = await attemptDelivery({
    logId: log.id,
    endpointId: endpoint.id,
    url: endpoint.url,
    body,
    signature,
    eventType,
    failedSoFar: 0,
    retry: false,
  })
  return { success: delivered.status === 'delivered', logId: log.id }
}