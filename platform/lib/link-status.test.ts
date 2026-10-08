import { describe, expect, it } from 'vitest'
import { linkAmountLabel, linkBadge, linkPaidLabel } from './link-status'

// How payment links read in the dashboard (U21).
const NOW = Date.UTC(2026, 9, 7, 6, 0)
const link = (overrides: Record<string, unknown> = {}) => ({
  status: 'active', expiry_at: null, max_uses: null, paid_count: 0, paid_total: 0,
  amount: 500, amount_flexible: false, min_amount: null, max_amount: null, custom_fields: [], ...overrides,
})

describe('link badge', () => {
  it('says whether a link still takes payments, the way the payment page decides', () => {
    expect(linkBadge(link(), NOW).label).toBe('Active')
    expect(linkBadge(link({ status: 'inactive' }), NOW).label).toBe('Paused')
    expect(linkBadge(link({ expiry_at: new Date(NOW - 60_000).toISOString() }), NOW).label).toBe('Expired')
    expect(linkBadge(link({ expiry_at: new Date(NOW + 60_000).toISOString() }), NOW).label).toBe('Active')
    expect(linkBadge(link({ max_uses: 3, paid_count: 3 }), NOW).label).toBe('Used up')
    expect(linkBadge(link({ max_uses: 3, paid_count: 2 }), NOW).label).toBe('Active')
  })

  it('shows a paused link as paused even when it has also expired', () => {
    expect(linkBadge(link({ status: 'inactive', expiry_at: new Date(NOW - 60_000).toISOString() }), NOW).label).toBe('Paused')
  })
})

describe('link amount', () => {
  it('describes fixed, customer-entered and product links', () => {
    expect(linkAmountLabel(link())).toBe('₹500')
    expect(linkAmountLabel(link({ amount: null, amount_flexible: true }))).toBe('Customer enters amount')
    expect(linkAmountLabel(link({ amount: null, amount_flexible: true, min_amount: 10, max_amount: 5000 })))
      .toBe('Customer enters amount · Between ₹10 and ₹5,000')
    const products = (items: Array<{ price: string }>) => link({ amount: null, custom_fields: [{ _type: 'products', items }] })
    expect(linkAmountLabel(products([{ price: '799' }, { price: '249' }, { price: '49' }]))).toBe('3 products from ₹49')
    expect(linkAmountLabel(products([{ price: '250' }]))).toBe('₹250 per item')
  })
})

describe('link earnings', () => {
  it('counts money received instead of checkouts started', () => {
    expect(linkPaidLabel(link({ paid_count: 3, paid_total: 1500 }))).toBe('3 paid · ₹1,500 received')
    expect(linkPaidLabel(link())).toBe('No payments yet')
  })
})
