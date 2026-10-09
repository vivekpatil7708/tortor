import { nextWebhookAttemptAt, retryWindowStart } from '@/lib/webhook-retry'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { payloadFingerprint } from '@/lib/payments/webhook-processor'
import { getCourierWebhookSecret } from './connections'
import { mapCourierStatusToPackageStatus } from './status-map'
import { applyCourierTrackingUpdate } from './apply-tracking'
import { verifyCourierWebhookSignature } from './signatures'
import type { TrackingEvent } from './provider'

// Map provider-style event type names to app package statuses.
const EVENT_TYPE_STATUS: Record<string, string> = {
  'shipment.created': 'shipped',
  'shipment.picked_up': 'shipped',
  'shipment.pickup_scheduled': 'shipped',
  'shipment.in_transit': 'in_transit',
  'shipment.out_for_delivery': 'out_for_delivery',
  'shipment.delivered': 'delivered',
  'shipment.delivery_failed': 'delivery_failed',
  'shipment.rto_initiated': 'returned',
  'shipment.rto_delivered': 'returned',
}

function pick(obj: Record<string, unknown> | undefined, ...keys: string[]): string | null {
  if (!obj) return null
  for (const k of keys) {
    const v = obj[k]
    if (v != null && v !== '') return String(v)
  }
  return null
}

function pickNested(payload: Record<string, unknown>, path: string): unknown {
  let current: unknown = payload
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function extractTrackingUpdate(payload: Record<string, unknown>) {
  const shipment = (payload.shipment as Record<string, unknown> | undefined) || payload
  const rawStatus = pickOr(payload, shipment)
  const eventType = pick(shipment, 'event_type', 'event') || pick(payload, 'event') || ''
  const statusFromEvent = EVENT_TYPE_STATUS[eventType] ?? null
  const mapped = mapCourierStatusToPackageStatus((rawStatus || statusFromEvent || 'in_transit') as string)

  const occurredRaw = pick(shipment, 'occurred_at', 'event_at', 'status_updated_at', 'updated_at')
  const at = occurredRaw ? new Date(occurredRaw) : new Date()
  const label = pick(shipment, 'label', 'status_message', 'description') || ('Tracking update: ' + mapped)

  const events: TrackingEvent[] = [
    {
      eventId: pick(shipment, 'event_id', 'activity_id', 'id') || undefined,
      eventType: eventType || 'tracking',
      label,
      status: mapped,
      location: pick(shipment, 'location', 'city', 'current_location'),
      at,
      raw: shipment,
    },
  ]

  const returnTrackingNumber = pick(shipment, 'return_tracking_number', 'return_awb_number')
  const trackingUrl = pick(shipment, 'tracking_url')
  const estimatedRaw = pick(shipment, 'estimated_delivery_at', 'eta') || pick(payload, 'estimated_delivery_at')

  return {
    status: mapped,
    events,
    rtoInitiated: mapped === 'returned' && (EFFECTIVE_RTO.includes(eventType)),
    rtoDelivered: mapped === 'returned' && eventType === 'shipment.rto_delivered',
    returnTrackingNumber,
    trackingUrl,
    estimatedDeliveryAt: estimatedRaw ? new Date(estimatedRaw) : undefined,
  }
}

const EFFECTIVE_RTO = ['shipment.rto_initiated', 'shipment.rto_delivered', 'rto_initiated', 'rto_delivered']

function pickOr(payload: Record<string, unknown>, shipment: Record<string, unknown>): string | null {
  return pick(shipment, 'status', 'package_status', 'current_status') || pick(payload, 'status')
}

export interface CourierWebhookProcessResult {
  eventId: string
  signatureValid: boolean
  duplicate: boolean
  applied: boolean
  changed: boolean
  outOfOrder: boolean
  error?: string
  packageId?: string | null
  merchantId?: string | null
}

/**
 * Courier webhook entry point.
 *
 * - Persists the incoming event (idempotent on provider+event id).
 * - Resolves the package by AWB / provider shipment id / tracking number.
 * - Verifies the merchant's courier webhook secret.
 * - Applies the tracking update (monotonic, no downgrades, terminal states).
 */
export async function processCourierWebhook(params: {
  provider: string
  rawBody: string
  signature: string | null
}): Promise<CourierWebhookProcessResult> {
  const { provider, rawBody, signature } = params
  const payload = (JSON.parse(rawBody || '{}') as Record<string, unknown>) || {}

  const shipment = (payload.shipment as Record<string, unknown> | undefined) || payload
  const awbNumber = pick(shipment, 'awb_number', 'awb', 'awb_code')
  const shipmentId = pick(shipment, 'shipment_id', 'provider_shipment_id')
  const trackingNumber = pick(shipment, 'tracking_number')
  const orderNumber = pick(shipment, 'order_number') || pick(payload, 'order_number')
  const merchantHint = pick(payload, 'merchant_id')

  // Locate the package + merchant this event belongs to.
  let packageId: string | null = null
  let merchantId: string | null = merchantHint

  if (!merchantId) {
    const pkg = await findPackageByRef(awbNumber, shipmentId, trackingNumber, orderNumber)
    packageId = pkg?.id ?? null
    merchantId = pkg?.merchantId ?? null
  } else if (awbNumber) {
    const pkg = await prisma.package.findFirst({ where: { merchantId, awbNumber }, select: { id: true } })
    packageId = pkg?.id ?? null
  }

  // Verify before storing anything, and answer unknown and unsigned events the
  // same way so replies can't be used to probe tracking or order numbers.
  const secret = packageId && merchantId ? await getCourierWebhookSecret(merchantId, provider) : null
  if (!packageId || !merchantId || !secret || !providerValidates(provider, rawBody, signature, secret)) {
    return { eventId: '', signatureValid: false, duplicate: false, applied: false, changed: false, outOfOrder: false, error: 'Rejected' }
  }

  const providerEventId = pick(shipment, 'event_id', 'id', 'webhook_id') || payloadFingerprint(rawBody)

  // Persist source-of-truth event for dedupe.
  const event = await prisma.courierWebhookEvent.create({
    data: {
      provider,
      providerEventId,
      eventType: pick(shipment, 'event_type', 'event') || 'tracking',
      payload: payload as unknown as Prisma.InputJsonValue,
      merchantId,
      packageId,
      awbNumber,
      trackingNumber,
      signatureValid: true,
      processingStatus: 'processing',
    },
  }).catch(async (err: unknown) => {
    const isDuplicate = typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'
    if (isDuplicate) {
      const existing = await prisma.courierWebhookEvent.findFirst({ where: { provider, providerEventId } })
      if (existing) {
        await prisma.courierWebhookEvent.update({
          where: { id: existing.id },
          data: { processingStatus: 'duplicate', processedAt: new Date() },
        })
        return prisma.courierWebhookEvent.findUnique({ where: { id: existing.id } })
      }
      return null
    }
    throw err
  })

  if (!event) return { eventId: '', signatureValid: false, duplicate: false, applied: false, changed: false, outOfOrder: false, error: 'Failed to persist event' }

  if (event.processingStatus === 'duplicate') {
    return { eventId: event.id, signatureValid: true, duplicate: true, applied: false, changed: false, outOfOrder: false, packageId, merchantId }
  }

  try {
    const update = extractTrackingUpdate(payload)
    const result = await applyCourierTrackingUpdate({
      merchantId,
      packageId,
      providerName: provider,
      status: update.status,
      events: update.events,
      estimatedDeliveryAt: (update.estimatedDeliveryAt as Date | undefined) ?? null,
      rtoInitiated: update.rtoInitiated,
      rtoDelivered: update.rtoDelivered,
      returnTrackingNumber: update.returnTrackingNumber,
      trackingUrl: update.trackingUrl,
      trigger: 'webhook',
      courierWebhookEventId: event.id,
    })

    if (result.applied) {
      await prisma.courierWebhookEvent.update({
        where: { id: event.id },
        data: { processingStatus: 'processed', processingError: null, processedAt: new Date(), nextRetryAt: null, retryCount: event.retryCount + 1 },
      })
    }
    return {
      eventId: event.id,
      signatureValid: true,
      duplicate: false,
      applied: result.applied,
      changed: result.changed,
      outOfOrder: result.outOfOrder,
      error: result.skippedReason,
      packageId,
      merchantId,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Processing failed'
    const isRetryable = /network|timeout|connection reset|econnreset|enotfound|fetch|request failed|upstream|503|502|504|429/i.test(message)
    if (!isRetryable) {
      await prisma.courierWebhookEvent.update({
        where: { id: event.id },
        data: { processingStatus: 'skipped', processingError: message, nextRetryAt: null, processedAt: new Date(), retryCount: event.retryCount + 1 },
      })
    } else {
      const next = nextWebhookAttemptAt(event.retryCount + 1)
      await prisma.courierWebhookEvent.update({
        where: { id: event.id },
        data: { processingStatus: 'failed_processing', processingError: message, retryCount: event.retryCount + 1, nextRetryAt: next },
      })
    }
    return { eventId: event.id, signatureValid: true, duplicate: false, applied: false, changed: false, outOfOrder: false, error: message, packageId, merchantId }
  }
}

/**
 * Retries failed courier webhook events whose nextRetryAt has come.
 * Called by /api/cron/webhook-retries. Returns how many were attempted.
 */
export async function retryDueCourierWebhooks({ deadline = Infinity, limit = 25 } = {}): Promise<number> {
  const due = await prisma.courierWebhookEvent.findMany({
    where: {
      processingStatus: 'failed_processing',
      nextRetryAt: { lte: new Date(), gte: retryWindowStart() },
    },
    orderBy: { nextRetryAt: 'asc' },
    take: limit,
  })

  let attempted = 0
  for (const event of due) {
    if (Date.now() > deadline) break

    const claimed = await prisma.courierWebhookEvent.updateMany({
      where: { id: event.id, processingStatus: 'failed_processing', nextRetryAt: event.nextRetryAt },
      data: { nextRetryAt: new Date(Date.now() + 10 * 60_000) },
    })
    if (claimed.count !== 1) continue

    const payload = event.payload as Record<string, unknown>
    const shipment = (payload.shipment as Record<string, unknown> | undefined) || payload
    const awbNumber = pick(shipment, 'awb_number', 'awb', 'awb_code')
    const shipmentId = pick(shipment, 'shipment_id', 'provider_shipment_id')
    const trackingNumber = pick(shipment, 'tracking_number')
    const orderNumber = pick(shipment, 'order_number') || pick(payload, 'order_number')

    let packageId: string | null = event.packageId ?? null
    let merchantId: string | null = event.merchantId ?? null
    if ((!packageId || !merchantId) && (awbNumber || shipmentId || trackingNumber || orderNumber)) {
      const found = await findPackageByRef(awbNumber, shipmentId, trackingNumber, orderNumber)
      if (found) {
        packageId = found.id
        merchantId = found.merchantId
      }
    }

    if (!packageId || !merchantId) {
      await prisma.courierWebhookEvent.update({
        where: { id: event.id },
        data: { processingStatus: 'skipped', processingError: 'Cannot resolve package', nextRetryAt: null, processedAt: new Date(), retryCount: event.retryCount + 1 },
      })
      continue
    }

    const secret = await getCourierWebhookSecret(merchantId!, event.provider).catch(() => null)
    if (!secret || !providerValidates(event.provider, JSON.stringify(payload), null, secret)) {
      await prisma.courierWebhookEvent.update({
        where: { id: event.id },
        data: { processingStatus: 'failed_processing', processingError: 'Signature/secret validation failed', nextRetryAt: null, retryCount: event.retryCount + 1 },
      })
      continue
    }

    try {
      const update = extractTrackingUpdate(payload)
      const result = await applyCourierTrackingUpdate({
        merchantId: merchantId!,
        packageId: packageId!,
        providerName: event.provider,
        status: update.status,
        events: update.events,
        estimatedDeliveryAt: (update.estimatedDeliveryAt as Date | undefined) ?? null,
        rtoInitiated: update.rtoInitiated,
        rtoDelivered: update.rtoDelivered,
        returnTrackingNumber: update.returnTrackingNumber,
        trackingUrl: update.trackingUrl,
        trigger: 'webhook',
        courierWebhookEventId: event.id,
      })

      if (result.applied) {
        await prisma.courierWebhookEvent.update({
          where: { id: event.id },
          data: { processingStatus: 'processed', processingError: null, nextRetryAt: null, processedAt: new Date(), retryCount: event.retryCount + 1 },
        })
      } else {
        const reason = result.skippedReason || ''
        const isNonRetryable = /no package/i.test(reason)
        if (isNonRetryable) {
          await prisma.courierWebhookEvent.update({
            where: { id: event.id },
            data: { processingStatus: 'skipped', processingError: reason, nextRetryAt: null, processedAt: new Date(), retryCount: event.retryCount + 1 },
          })
        } else {
          const next = nextWebhookAttemptAt(event.retryCount + 1)
          await prisma.courierWebhookEvent.update({
            where: { id: event.id },
            data: { processingStatus: 'failed_processing', processingError: reason || 'Not applied', retryCount: event.retryCount + 1, nextRetryAt: next },
          })
        }
      }
      attempted += 1
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Processing failed'
      const isRetryable = /network|timeout|connection reset|econnreset|enotfound|fetch|request failed|upstream|503|502|504|429/i.test(message)
      if (!isRetryable) {
        await prisma.courierWebhookEvent.update({
          where: { id: event.id },
          data: { processingStatus: 'skipped', processingError: message, nextRetryAt: null, processedAt: new Date(), retryCount: event.retryCount + 1 },
        })
      } else {
        const next = nextWebhookAttemptAt(event.retryCount + 1)
        await prisma.courierWebhookEvent.update({
          where: { id: event.id },
          data: { processingStatus: 'failed_processing', processingError: message, retryCount: event.retryCount + 1, nextRetryAt: next },
        })
      }
      attempted += 1
    }
  }
  return attempted
}

function providerValidates(provider: string, rawBody: string, signature: string | null, secret: string): boolean {
  // All providers use the shared HMAC-SHA256 convention for now.
  return verifyCourierWebhookSignature({ rawBody, signature, secret })
}

async function findPackageByRef(
  awbNumber: string | null,
  shipmentId: string | null,
  trackingNumber: string | null,
  orderNumber: string | null
): Promise<{ id: string; merchantId: string } | null> {
  const where: Array<Record<string, string>> = []
  if (awbNumber) where.push({ awbNumber })
  if (shipmentId) where.push({ providerShipmentId: shipmentId })
  if (trackingNumber) where.push({ trackingNumber })

  const direct = await prisma.package.findFirst({
    where: { OR: where },
    select: { id: true, merchantId: true },
  })
  if (direct) return direct

  if (orderNumber) {
    const order = await prisma.order.findFirst({
      where: { orderNumber },
      select: { id: true, merchantId: true },
    })
    if (order) {
      const f = await prisma.fulfillment.findFirst({
        where: { orderId: order.id, fulfillmentType: { in: ['shipping', 'local_delivery'] } },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })
      if (f) {
        const pkg = await prisma.package.findFirst({ where: { fulfillmentId: f.id }, select: { id: true, merchantId: true } })
        if (pkg) return pkg
      }
    }
  }
  return null
}