import { describe, it, expect } from 'vitest'
import {
  canTransitionOrder,
  canTransitionPayment,
  canTransitionFulfillment,
  generateOrderNumber,
  generateFulfillmentNumber,
  generateTrackingToken,
  ORDER_TRANSITIONS,
  PAYMENT_TRANSITIONS,
} from '@/lib/status'

describe('order status transitions', () => {
  it('allows new -> processing', () => {
    expect(canTransitionOrder('new', 'processing').ok).toBe(true)
  })

  it('allows pending_payment -> new', () => {
    expect(canTransitionOrder('pending_payment', 'new').ok).toBe(true)
  })

  it('rejects new -> delivered (not a valid order status)', () => {
    expect(canTransitionOrder('new', 'delivered').ok).toBe(false)
  })

  it('rejects completed -> new (terminal state)', () => {
    expect(canTransitionOrder('completed', 'new').ok).toBe(false)
  })

  it('allows processing -> on_hold and back', () => {
    expect(canTransitionOrder('processing', 'on_hold').ok).toBe(true)
    expect(canTransitionOrder('on_hold', 'processing').ok).toBe(true)
  })

  it('same-status is identity', () => {
    expect(canTransitionOrder('new', 'new').ok).toBe(true)
  })

  it('every transition target exists in the map', () => {
    for (const [from, targets] of Object.entries(ORDER_TRANSITIONS)) {
      for (const to of targets) {
        expect(canTransitionOrder(from, to).ok, `${from}->${to}`).toBe(true)
      }
    }
  })
})

describe('payment status transitions', () => {
  it('allows pending -> paid', () => {
    expect(canTransitionPayment('pending', 'paid').ok).toBe(true)
  })

  it('rejects paid -> pending (money never goes backwards)', () => {
    expect(canTransitionPayment('paid', 'pending').ok).toBe(false)
  })

  it('allows paid -> refunded', () => {
    expect(canTransitionPayment('paid', 'refunded').ok).toBe(true)
  })

  it('every transition target exists in the map', () => {
    for (const [from, targets] of Object.entries(PAYMENT_TRANSITIONS)) {
      for (const to of targets) {
        expect(canTransitionPayment(from, to).ok, `${from}->${to}`).toBe(true)
      }
    }
  })
})

describe('fulfillment status transitions', () => {
  it('allows unfulfilled -> processing -> packed -> shipped', () => {
    expect(canTransitionFulfillment('unfulfilled', 'processing', 'shipping').ok).toBe(true)
    expect(canTransitionFulfillment('processing', 'packed', 'shipping').ok).toBe(true)
    expect(canTransitionFulfillment('packed', 'shipped', 'shipping').ok).toBe(true)
  })

  it('allows shipped -> in_transit -> out_for_delivery -> delivered', () => {
    expect(canTransitionFulfillment('shipped', 'in_transit', 'shipping').ok).toBe(true)
    expect(canTransitionFulfillment('in_transit', 'out_for_delivery', 'shipping').ok).toBe(true)
    expect(canTransitionFulfillment('out_for_delivery', 'delivered', 'shipping').ok).toBe(true)
  })

  it('rejects unfulfilled -> delivered for courier shipping', () => {
    expect(canTransitionFulfillment('unfulfilled', 'delivered', 'shipping').ok).toBe(false)
  })

  it('allows direct-to-delivered for local_delivery / pickup / digital / service', () => {
    for (const type of ['local_delivery', 'pickup', 'digital', 'service']) {
      expect(canTransitionFulfillment('unfulfilled', 'delivered', type).ok, type).toBe(true)
    }
  })

  it('rejects delivered -> shipped (terminal)', () => {
    expect(canTransitionFulfillment('delivered', 'shipped', 'shipping').ok).toBe(false)
  })

  it('allows delivery_failed -> returned', () => {
    expect(canTransitionFulfillment('delivery_failed', 'returned', 'shipping').ok).toBe(true)
    expect(canTransitionFulfillment('delivery_failed', 'in_transit', 'shipping').ok).toBe(true)
  })
})

describe('identifier generation', () => {
  it('generateOrderNumber has TP-YYYY-XXXX shape', () => {
    const year = new Date().getFullYear()
    expect(generateOrderNumber()).toMatch(new RegExp(`^TP-${year}-[A-Z0-9]{4}$`))
  })

  it('orders get unique numbers across calls', () => {
    const a = generateOrderNumber()
    const b = generateOrderNumber()
    expect(a).not.toBe(b)
  })

  it('generateFulfillmentNumber has F-XXXX shape and is unique', () => {
    const a = generateFulfillmentNumber()
    const b = generateFulfillmentNumber()
    expect(a).toMatch(/^F-[A-Z0-9]{8}$/)
    expect(a).not.toBe(b)
  })

  it('generateTrackingToken is a long opaque string', () => {
    const a = generateTrackingToken()
    expect(a.length).toBeGreaterThanOrEqual(16)
    expect(a).not.toBe(generateTrackingToken())
  })
})