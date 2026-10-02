import { describe, expect, it } from 'vitest'
import { checkLinkAmount, type LinkPricing } from './link-amount'

const base: LinkPricing = { amount: null, amountFlexible: false, minAmount: null, maxAmount: null, customFields: '[]' }

function withProducts(items: unknown[]): LinkPricing {
  return { ...base, customFields: JSON.stringify([{ _type: 'products', items }]) }
}

describe('fixed amount links', () => {
  const link = { ...base, amount: 5000 }

  it('accepts the link amount', () => {
    expect(checkLinkAmount(link, 5000, undefined)).toEqual({ ok: true, amount: 5000, products: null })
  })

  it('rejects any other amount', () => {
    expect(checkLinkAmount(link, 1, undefined).ok).toBe(false)
    expect(checkLinkAmount(link, '4999.99', undefined).ok).toBe(false)
  })

  it('rejects missing, zero, negative and non-numeric amounts', () => {
    for (const bad of [undefined, 0, -5000, 'abc', NaN, Infinity]) {
      expect(checkLinkAmount(link, bad, undefined).ok).toBe(false)
    }
  })

  it('rejects links without an amount', () => {
    expect(checkLinkAmount(base, 100, undefined).ok).toBe(false)
  })
})

describe('flexible amount links', () => {
  const link = { ...base, amountFlexible: true, minAmount: 100, maxAmount: 1000 }

  it('accepts amounts inside the range', () => {
    expect(checkLinkAmount(link, 100, undefined)).toMatchObject({ ok: true, amount: 100 })
    expect(checkLinkAmount(link, 1000, undefined)).toMatchObject({ ok: true, amount: 1000 })
  })

  it('rejects amounts outside the range', () => {
    expect(checkLinkAmount(link, 99, undefined).ok).toBe(false)
    expect(checkLinkAmount(link, 1001, undefined).ok).toBe(false)
  })

  it('defaults the minimum to 1 rupee', () => {
    const open = { ...base, amountFlexible: true }
    expect(checkLinkAmount(open, 0.5, undefined).ok).toBe(false)
    expect(checkLinkAmount(open, 1, undefined).ok).toBe(true)
  })
})

describe('product links where the customer picks products', () => {
  const link = withProducts([
    { name: 'T-shirt', price: '499', category: 'Clothes' },
    { name: 'Cap', price: '199.50', category: '' },
  ])

  it('prices the chosen products from the link', () => {
    const result = checkLinkAmount(link, 698.5, [
      { name: 'T-shirt', price: '499', quantity: 1 },
      { name: 'Cap', price: '199.50', quantity: 1 },
    ])
    expect(result).toEqual({
      ok: true,
      amount: 698.5,
      products: [
        { name: 'T-shirt', price: '499', category: 'Clothes', quantity: 1 },
        { name: 'Cap', price: '199.50', category: '', quantity: 1 },
      ],
    })
  })

  it('rejects a tampered price', () => {
    expect(checkLinkAmount(link, 1, [{ name: 'T-shirt', price: '1', quantity: 1 }]).ok).toBe(false)
  })

  it('rejects an amount that does not match the products', () => {
    expect(checkLinkAmount(link, 1, [{ name: 'T-shirt', price: '499', quantity: 1 }]).ok).toBe(false)
  })

  it('rejects unknown products, repeats and extra quantity', () => {
    expect(checkLinkAmount(link, 10, [{ name: 'Gold bar', price: '10', quantity: 1 }]).ok).toBe(false)
    expect(checkLinkAmount(link, 998, [
      { name: 'T-shirt', price: '499', quantity: 1 },
      { name: 'T-shirt', price: '499', quantity: 1 },
    ]).ok).toBe(false)
    expect(checkLinkAmount(link, 998, [{ name: 'T-shirt', price: '499', quantity: 2 }]).ok).toBe(false)
  })

  it('requires at least one product, ignoring the fixed amount', () => {
    expect(checkLinkAmount({ ...link, amount: 500 }, 500, []).ok).toBe(false)
    expect(checkLinkAmount({ ...link, amount: 500 }, 500, undefined).ok).toBe(false)
  })

  it('matches unnamed products the way the checkout labels them', () => {
    const unnamed = withProducts([{ name: '', price: '50' }])
    expect(checkLinkAmount(unnamed, 50, [{ name: 'Item 1', price: '50', quantity: 1 }])).toMatchObject({ ok: true, amount: 50 })
  })
})

describe('product links with quantities', () => {
  const link = withProducts([
    { name: 'Notebook', price: '33.33', quantity: 5 },
    { name: 'Pen', price: '10', quantity: 1 },
  ])

  it('accepts quantities up to the stock limit', () => {
    const result = checkLinkAmount(link, 109.99, [
      { name: 'Notebook', price: '33.33', quantity: 3 },
      { name: 'Pen', price: '10', quantity: 1 },
    ])
    expect(result).toMatchObject({ ok: true, amount: 109.99 })
  })

  it('rejects quantities above the limit or below 1', () => {
    expect(checkLinkAmount(link, 199.98, [{ name: 'Notebook', price: '33.33', quantity: 6 }]).ok).toBe(false)
    expect(checkLinkAmount(link, 20, [{ name: 'Pen', price: '10', quantity: 2 }]).ok).toBe(false)
    expect(checkLinkAmount(link, 1, [{ name: 'Notebook', price: '33.33', quantity: 0 }]).ok).toBe(false)
    expect(checkLinkAmount(link, 16.66, [{ name: 'Notebook', price: '33.33', quantity: 0.5 }]).ok).toBe(false)
  })
})
