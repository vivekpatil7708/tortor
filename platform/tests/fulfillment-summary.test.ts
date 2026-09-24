import { describe, it, expect } from 'vitest'
import { computeFulfillmentSummary } from '@/lib/fulfillment-summary'

function fulfillment(status: string, qty: number, fulfillmentType = 'shipping', packageStatus?: string) {
  return {
    status,
    fulfillmentType,
    items: [{ quantity: qty }],
    packages: packageStatus ? [{ packageStatus }] : [],
  } as any
}

const orderWith = (orderItems: Array<{ quantityOrdered: number; quantityCancelled: number }>, fulfillments: any[] = []) =>
  ({ orderItems, fulfillments }) as any

describe('computeFulfillmentSummary', () => {
  it('empty order is unfulfilled', () => {
    expect(computeFulfillmentSummary(orderWith([]))).toBe('unfulfilled')
  })

  it('no fulfillments and nothing cancelled is unfulfilled', () => {
    expect(computeFulfillmentSummary(orderWith([{ quantityOrdered: 2, quantityCancelled: 0 }]))).toBe('unfulfilled')
  })

  it('all items cancelled with no fulfillments is cancelled', () => {
    expect(computeFulfillmentSummary(orderWith([{ quantityOrdered: 2, quantityCancelled: 2 }]))).toBe('cancelled')
  })

  it('partial quantity shipped is partially_fulfilled', () => {
    expect(
      computeFulfillmentSummary(orderWith([{ quantityOrdered: 4, quantityCancelled: 0 }], [fulfillment('packed', 2)]))
    ).toBe('partially_fulfilled')
  })

  it('all quantity shipped but zero delivered is fulfilled', () => {
    expect(
      computeFulfillmentSummary(orderWith([{ quantityOrdered: 4, quantityCancelled: 0 }], [fulfillment('shipped', 4)]))
    ).toBe('fulfilled')
  })

  it('all quantity shipped and package delivered is delivered', () => {
    expect(
      computeFulfillmentSummary(
        orderWith([{ quantityOrdered: 4, quantityCancelled: 0 }], [fulfillment('shipped', 4, 'shipping', 'delivered')])
      )
    ).toBe('delivered')
  })

  it('some delivered, some shipped-not-delivered is partially_delivered', () => {
    expect(
      computeFulfillmentSummary(
        orderWith(
          [{ quantityOrdered: 4, quantityCancelled: 0 }],
          [
            fulfillment('shipped', 2, 'shipping', 'delivered'),
            fulfillment('shipped', 2, 'shipping', 'in_transit'),
          ]
        )
      )
    ).toBe('partially_delivered')
  })

  it('a failing package forces attention_required', () => {
    expect(
      computeFulfillmentSummary(
        orderWith(
          [{ quantityOrdered: 4, quantityCancelled: 0 }],
          [fulfillment('shipped', 4, 'shipping', 'delivery_failed')]
        )
      )
    ).toBe('attention_required')
  })

  it('a returned fulfillment forces attention_required', () => {
    expect(
      computeFulfillmentSummary(
        orderWith([{ quantityOrdered: 1, quantityCancelled: 0 }], [fulfillment('delivery_failed', 1)])
      )
    ).toBe('attention_required')
  })

  it('cancel a part of the order reduces the delivery threshold', () => {
    // order: 4 ordered, 1 cancelled, 3 shipped+delivered => delivered
    expect(
      computeFulfillmentSummary(
        orderWith(
          [{ quantityOrdered: 4, quantityCancelled: 1 }],
          [fulfillment('shipped', 3, 'shipping', 'delivered')]
        )
      )
    ).toBe('delivered')
  })

  it('local_delivery fulfillment marked delivered counts as delivered', () => {
    expect(
      computeFulfillmentSummary(
        orderWith([{ quantityOrdered: 1, quantityCancelled: 0 }], [fulfillment('delivered', 1, 'local_delivery')])
      )
    ).toBe('delivered')
  })
})