// Mapping between provider courier statuses and app statuses, plus the
// monotonic progression rules applied to courier-driven tracking updates.

export const PACKAGE_STATUSES = [
  'not_shipped',
  'shipped',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'delivery_failed',
  'returned',
  'cancelled',
] as const

export type PackageStatusValue = (typeof PACKAGE_STATUSES)[number]

const STATUS_SYNONYMS: Record<string, string> = {
  created: 'shipped',
  shipped: 'shipped',
  picked_up: 'shipped',
  pickup_scheduled: 'not_shipped',
  awaiting_pickup: 'not_shipped',
  pending: 'not_shipped',
  not_shipped: 'not_shipped',
  in_transit: 'in_transit',
  transit: 'in_transit',
  reaching_destination: 'in_transit',
  out_for_delivery: 'out_for_delivery',
  out_of_delivery: 'out_for_delivery',
  delivered: 'delivered',
  delivery_failed: 'delivery_failed',
  failed: 'delivery_failed',
  undelivered: 'delivery_failed',
  returned: 'returned',
  rto: 'returned',
  rto_initiated: 'returned',
  returned_to_sender: 'returned',
  cancelled: 'cancelled',
}

const VALID = new Set<string>(PACKAGE_STATUSES)

/** Map an arbitrary provider status string to a valid app PackageStatus. */
export function mapCourierStatusToPackageStatus(status: string | null | undefined): string {
  if (!status) return 'not_shipped'
  const key = String(status).trim().toLowerCase().replace(/\s+/g, '_')
  if (VALID.has(key)) return key
  return STATUS_SYNONYMS[key] ?? 'in_transit'
}

/** Canonical stage used to detect out-of-order/downgrade events. */
export function courierStatusStage(status: string): number {
  switch (mapCourierStatusToPackageStatus(status)) {
    case 'not_shipped': return 0
    case 'shipped': return 1
    case 'in_transit': return 2
    case 'out_for_delivery': return 3
    case 'delivered':
    case 'delivery_failed':
    case 'returned': return 4
    case 'cancelled': return 5
    default: return 99
  }
}

/** Courier-driven transitions. Merchants never regress packages through these. */
const COURIER_TRANSITIONS: Record<string, string[]> = {
  not_shipped: ['shipped', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed'],
  shipped: ['in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'],
  in_transit: ['out_for_delivery', 'delivered', 'delivery_failed', 'returned'],
  out_for_delivery: ['delivered', 'delivery_failed', 'returned'],
  delivered: [],
  delivery_failed: ['in_transit', 'delivered', 'returned'],
  returned: [],
  cancelled: [],
}

export interface TransitionEvaluation {
  allowed: boolean
  outOfOrder: boolean
  noChange: boolean
  reason?: string
}

export function evaluateCourierTransition(current: string, next: string): TransitionEvaluation {
  const from = mapCourierStatusToPackageStatus(current)
  const to = mapCourierStatusToPackageStatus(next)

  if (!VALID.has(from) || !VALID.has(to)) {
    return { allowed: false, outOfOrder: false, noChange: false, reason: `Invalid package status: '${next}'` }
  }

  if (from === to) {
    return { allowed: true, outOfOrder: false, noChange: true }
  }

  if (courierStatusStage(to) < courierStatusStage(from)) {
    return { allowed: false, outOfOrder: true, noChange: false, reason: `Out-of-order event: '${next}' received after '${current}'` }
  }

  const allowed = COURIER_TRANSITIONS[from] ?? []
  if (allowed.includes(to)) {
    return { allowed: true, outOfOrder: false, noChange: false }
  }

  return { allowed: false, outOfOrder: false, noChange: false, reason: `Unexpected transition '${current}' -> '${next}'` }
}