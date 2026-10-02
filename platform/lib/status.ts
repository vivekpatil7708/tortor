import { nanoid } from 'nanoid'

// ============================================================
// ORDER STATUS TRANSITIONS
// ============================================================

export const ORDER_TRANSITIONS: Record<string, string[]> = {
  pending_payment: ['new', 'cancelled'],
  new: ['processing', 'on_hold', 'cancelled'],
  processing: ['on_hold', 'completed', 'cancelled'],
  on_hold: ['new', 'processing', 'cancelled'],
  completed: [],
  cancelled: [],
}

export const PAYMENT_TRANSITIONS: Record<string, string[]> = {
  pending: ['paid', 'failed', 'expired', 'refunded'],
  paid: ['refunded', 'failed'],
  failed: ['pending', 'paid'],
  expired: ['pending', 'paid'],
  refunded: [],
}

// ============================================================
// FULFILLMENT STATUS TRANSITIONS
// ============================================================

export const FULFILLMENT_TRANSITIONS: Record<string, string[]> = {
  unfulfilled: ['processing', 'packed', 'cancelled'],
  processing: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'],
  in_transit: ['out_for_delivery', 'delivered', 'delivery_failed', 'returned'],
  out_for_delivery: ['delivered', 'delivery_failed', 'returned'],
  delivered: [],
  delivery_failed: ['in_transit', 'returned', 'cancelled'],
  returned: [],
  cancelled: [],
}

/**
 * Fulfillment types that may jump straight to `delivered` without a courier
 * shipment (local delivery, pickup, digital delivery, service completion).
 */
export const DIRECT_DELIVERY_TYPES = ['local_delivery', 'pickup', 'digital', 'service']

export function canTransitionFulfillment(
  current: string,
  next: string,
  fulfillmentType: string
): { ok: boolean; error?: string } {
  if (current === next) return { ok: true }
  const allowed = FULFILLMENT_TRANSITIONS[current]
  if (!allowed) return { ok: false, error: `Invalid transition from '${current}'` }
  if (allowed.includes(next)) return { ok: true }

  // Direct delivered is allowed only for local delivery / pickup / digital / service
  if (next === 'delivered' && DIRECT_DELIVERY_TYPES.includes(fulfillmentType)) return { ok: true }

  return { ok: false, error: `Cannot transition fulfillment from '${current}' to '${next}'` }
}

export function canTransitionOrder(current: string, next: string): { ok: boolean; error?: string } {
  if (current === next) return { ok: true }
  const allowed = ORDER_TRANSITIONS[current]
  if (!allowed) return { ok: false, error: `Invalid order status transition '${current}' -> '${next}'` }
  if (allowed.includes(next)) return { ok: true }
  return { ok: false, error: `Cannot transition order from '${current}' to '${next}'` }
}

export function canTransitionPayment(current: string, next: string): { ok: boolean; error?: string } {
  if (current === next) return { ok: true }
  const allowed = PAYMENT_TRANSITIONS[current]
  if (!allowed) return { ok: false, error: `Invalid payment status transition '${current}' -> '${next}'` }
  if (allowed.includes(next)) return { ok: true }
  return { ok: false, error: `Cannot transition payment from '${current}' to '${next}'` }
}

// ============================================================
// ORDER NUMBER GENERATION
// ============================================================

export function generateOrderNumber(): string {
  const year = new Date().getFullYear()
  let seq = ''
  do {
    // nanoid's alphabet includes '-' and '_'; re-roll until we have 4 alphanumerics.
    seq = nanoid(4).toUpperCase().replace(/[^A-Z0-9]/g, '')
  } while (seq.length < 4)
  return `TP-${year}-${seq.slice(0, 4)}`
}

export function generateFulfillmentNumber(): string {
  let seq = ''
  do {
    seq = nanoid(8).toUpperCase().replace(/[^A-Z0-9]/g, '')
  } while (seq.length < 8)
  return `F-${seq.slice(0, 8)}`
}

export function generateTrackingToken(): string {
  return nanoid(32)
}