import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { canTransitionFulfillment } from '@/lib/status'
import { recalculateOrderFulfillmentSummary } from '@/lib/fulfillment-summary'
import { dispatchMerchantWebhook } from '@/lib/webhook-delivery'
import { evaluateCourierTransition, courierStatusStage, mapCourierStatusToPackageStatus } from './status-map'
import { notifyShipmentMilestone } from './notify'
import type { TrackingEvent } from './provider'
import type { FulfillmentStatus, KeyMode } from '@prisma/client'

export interface ApplyCourierUpdateParams {
  merchantId: string
  packageId: string
  providerName: string
  /** Mapped provider status — an app PackageStatus value. */
  status: string
  events?: TrackingEvent[]
  estimatedDeliveryAt?: Date | null
  rtoInitiated?: boolean
  rtoDelivered?: boolean
  returnTrackingNumber?: string | null
  trackingUrl?: string | null
  trigger: 'webhook' | 'sync'
  courierWebhookEventId?: string | null
}

export interface ApplyCourierUpdateResult {
  applied: boolean
  changed: boolean
  outOfOrder: boolean
  skippedReason?: string
  previousStatus?: string
  newStatus?: string
  recordedEvents: number
}

function readMetadata(pkg: { providerMetadata?: unknown }): Record<string, unknown> {
  const raw = pkg.providerMetadata as Record<string, unknown> | null
  return raw && typeof raw === 'object' ? raw : {}
}

const FULFILLMENT_MIRROR: Partial<Record<string, FulfillmentStatus>> = {
  shipped: 'shipped',
  in_transit: 'in_transit',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  delivery_failed: 'delivery_failed',
  returned: 'returned',
  cancelled: 'cancelled',
}

const MERCHANT_WEBHOOK_EVENT: Partial<Record<string, string>> = {
  shipped: 'shipment.created',
  in_transit: 'shipment.in_transit',
  out_for_delivery: 'shipment.out_for_delivery',
  delivered: 'shipment.delivered',
  delivery_failed: 'shipment.delivery_failed',
  returned: 'shipment.rto_initiated',
}

function toKeyMode(testMode: boolean): KeyMode {
  return testMode ? 'test' : 'live'
}

/**
 * Apply a courier-reported tracking update to a package.
 *
 * Rules:
 * - Status changes are monotonic — downgrades and out-of-order events are
 *   rejected (recorded but flagged, status untouched).
 * - `delivered`, `returned` and `cancelled` are terminal for courier input.
 * - Every accepted event is persisted as a customer-facing ShipmentEvent
 *   (source `courier`) plus an order status history entry.
 * - The parent fulfillment status is mirrored where the transition is valid,
 *   the order fulfillment summary is recalculated, a milestone email fires at
 *   most once per package, and subscribed merchant webhooks are dispatched.
 */
export async function applyCourierTrackingUpdate(params: ApplyCourierUpdateParams): Promise<ApplyCourierUpdateResult> {
  const {
    merchantId,
    packageId,
    providerName,
    status: rawStatus,
    events = [],
    estimatedDeliveryAt,
    rtoInitiated,
    rtoDelivered,
    returnTrackingNumber,
    trackingUrl,
    trigger,
    courierWebhookEventId,
  } = params

  const target = mapCourierStatusToPackageStatus(rawStatus)

  const pkg = await prisma.package.findFirst({
    where: { id: packageId, merchantId },
    include: { fulfillment: { include: { order: true } } },
  })
  if (!pkg) return { applied: false, changed: false, outOfOrder: false, skippedReason: 'Package not found', recordedEvents: 0 }

  const current = pkg.packageStatus
  const evaluation = evaluateCourierTransition(current, target)

  // Record the incoming courier events (they are facts, even when the status
  // change is rejected) so the customer timeline is complete.
  const metadata = readMetadata(pkg)
  const syncedIds = Array.isArray(metadata.synced_event_ids) ? (metadata.synced_event_ids as string[]) : []
  const freshEvents = events.filter(ev => !ev.eventId || !syncedIds.includes(ev.eventId))

  if (!evaluation.allowed) {
    const flag = {
      received: target,
      trigger,
      at: new Date().toISOString(),
      reason: evaluation.reason,
    }
    await prisma.package.update({
      where: { id: packageId },
      data: { providerMetadata: { ...metadata, unexpected_transition: flag, last_provider_sync_at: new Date().toISOString() } as never },
    })
    if (courierWebhookEventId) {
      await prisma.courierWebhookEvent.update({
        where: { id: courierWebhookEventId },
        data: { processingStatus: 'out_of_order', processingError: evaluation.reason, processedAt: new Date() },
      }).catch(() => null)
    }
    await logAudit({
      merchantId,
      actorUserId: null,
      action: 'courier_update_rejected',
      entityType: 'package',
      entityId: packageId,
      metadata: { from: current, to: target, reason: evaluation.reason, provider: providerName },
    })
    return {
      applied: false,
      changed: false,
      outOfOrder: true,
      skippedReason: evaluation.reason,
      previousStatus: current,
      newStatus: target,
      recordedEvents: 0,
    }
  }

  const changed = current !== target
  const now = new Date()

  // ---- persist in a transaction --------------------------------------------
  const appliedEvents = await prisma.$transaction(async (tx) => {
    const fieldUpdate: Record<string, unknown> = {
      packageStatus: target,
      lastProviderSyncAt: now,
    }
    if (target !== 'not_shipped' && !pkg.shippedAt) fieldUpdate.shippedAt = now
    if (target === 'delivered' && !pkg.deliveredAt) fieldUpdate.deliveredAt = now
    if ((target === 'shipped' || target === 'in_transit') && !pkg.pickedUpAt) fieldUpdate.pickedUpAt = now
    if (target === 'returned' && (rtoInitiated || rtoDelivered)) {
      if (!pkg.rtoInitiatedAt) fieldUpdate.rtoInitiatedAt = now
      if (rtoDelivered && !pkg.rtoDeliveredAt) fieldUpdate.rtoDeliveredAt = now
    }
    if (returnTrackingNumber) fieldUpdate.returnTrackingNumber = returnTrackingNumber
    if (trackingUrl) fieldUpdate.trackingUrl = trackingUrl
    if (estimatedDeliveryAt) fieldUpdate.estimatedDeliveryAt = estimatedDeliveryAt

    const prevFlags = metadata.unexpected_transition
    const nextMetadata: Record<string, unknown> = {
      ...metadata,
      last_courier_status: target,
      last_courier_at: now.toISOString(),
      synced_event_ids: [...syncedIds, ...freshEvents.map(e => e.eventId).filter(Boolean)] as string[],
    }
    if (prevFlags) {
      // A valid update clears an earlier unexpected-transition flag.
      delete nextMetadata.unexpected_transition
    }
    fieldUpdate.providerMetadata = nextMetadata

    await tx.package.update({ where: { id: packageId }, data: fieldUpdate })

    // Customer-facing timeline events (source courier), deduped by event id.
    const recorded: TrackingEvent[] = []
    for (const ev of freshEvents) {
      const created = await tx.shipmentEvent.create({
        data: {
          merchantId,
          packageId,
          eventLabel: ev.label,
          eventStatus: mapCourierStatusToPackageStatus(ev.status),
          location: ev.location ?? null,
          eventAt: ev.at,
          source: 'courier',
        },
      })
      recorded.push({ ...ev, eventId: created.id })
    }

    // Status history (only when the status actually changed).
    if (changed) {
      const statusEvent = events[events.length - 1]
      await tx.orderStatusHistory.create({
        data: {
          merchantId,
          orderId: pkg.fulfillment.orderId,
          fulfillmentId: pkg.fulfillmentId,
          packageId,
          previousStatus: current,
          newStatus: String(target),
          statusType: 'shipment',
          changedByUserId: null,
          changedByType: 'system',
          changeReason: statusEvent?.label ?? `Courier update: ${target}`,
        },
      })

      // Mirror to the fulfillment when the transition is valid.
      const mirrorTarget = FULFILLMENT_MIRROR[target]
      if (mirrorTarget && !['delivered', 'returned', 'cancelled'].includes(pkg.fulfillment.status)) {
        const check = canTransitionFulfillment(pkg.fulfillment.status, mirrorTarget, pkg.fulfillment.fulfillmentType)
        if (check.ok) {
          const ts: Record<string, Date> = {}
          if (mirrorTarget === 'shipped') ts.shippedAt = now
          if (mirrorTarget === 'delivered') ts.deliveredAt = now
          await tx.fulfillment.update({
            where: { id: pkg.fulfillmentId },
            data: { status: mirrorTarget, ...ts },
          })
        }
      }
    }

    // Courier webhook event linkage + state
    if (courierWebhookEventId) {
      await tx.courierWebhookEvent.update({
        where: { id: courierWebhookEventId },
        data: { processingStatus: 'processed', processedAt: new Date() },
      }).catch(() => null)
    }

    const summary = await recalculateOrderFulfillmentSummary(pkg.fulfillment.orderId, tx)

    await logAudit({
      merchantId,
      actorUserId: null,
      action: 'courier_tracking_applied',
      entityType: 'package',
      entityId: packageId,
      metadata: { from: current, to: target, provider: providerName, trigger, summary },
    })

    return { recorded, summary }
  })

  // ---- side effects outside the transaction ---------------------------------
  if (changed) {
    await notifyShipmentMilestone({ merchantId, packageId, status: target }).catch(() => null)

    const webhookEvent = MERCHANT_WEBHOOK_EVENT[target]
    if (webhookEvent) {
      await dispatchMerchantWebhook({
        merchantId,
        mode: toKeyMode(pkg.fulfillment.order.testMode),
        eventType: webhookEvent,
        data: {
          order_id: pkg.fulfillment.orderId,
          order_number: pkg.fulfillment.order.orderNumber,
          fulfillment_id: pkg.fulfillmentId,
          package_id: packageId,
          package_status: target,
          tracking_number: pkg.trackingNumber || pkg.awbNumber || null,
          awb_number: pkg.awbNumber || null,
          courier_provider: pkg.courierProvider || providerName,
          status: target,
          trigger,
        },
      }).catch(() => null)
      // Compat events
      const compat: Record<string, string> = { shipped: 'fulfillment.shipped', delivered: 'fulfillment.delivered' }
      if (compat[target]) {
        await dispatchMerchantWebhook({
          merchantId,
          mode: toKeyMode(pkg.fulfillment.order.testMode),
          eventType: compat[target],
          data: { order_id: pkg.fulfillment.orderId, order_number: pkg.fulfillment.order.orderNumber, fulfillment_id: pkg.fulfillmentId, status: target },
        }).catch(() => null)
      }
    }
  }

  return {
    applied: true,
    changed,
    outOfOrder: false,
    previousStatus: current,
    newStatus: target,
    recordedEvents: appliedEvents.recorded.length,
  }
}

export { courierStatusStage }