import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { checkCoupon, couponStatus, normalizeCouponCode, totalsWithDiscount } from '@/lib/coupons'

const dec = (n: number) => ({ toNumber: () => n }) as never

function coupon(overrides: Record<string, unknown> = {}) {
  return {
    code: 'SAVE10',
    isActive: true,
    discountType: 'percentage',
    discountValue: dec(10),
    minOrderAmount: null,
    maxUses: null,
    usedCount: 0,
    expiresAt: null,
    ...overrides,
  } as never
}

describe('normalizeCouponCode', () => {
  it('upper-cases and strips spaces', () => {
    expect(normalizeCouponCode('  welcome 10 ')).toBe('WELCOME10')
  })
})

describe('checkCoupon', () => {
  it('applies a percentage discount', () => {
    expect(checkCoupon(coupon(), 1000)).toEqual({ ok: true, discountAmount: 100 })
  })

  it('applies a fixed discount', () => {
    expect(checkCoupon(coupon({ discountType: 'fixed', discountValue: dec(150) }), 1000)).toEqual({
      ok: true,
      discountAmount: 150,
    })
  })

  it('never discounts more than the subtotal', () => {
    expect(checkCoupon(coupon({ discountType: 'fixed', discountValue: dec(500) }), 300)).toEqual({
      ok: true,
      discountAmount: 300,
    })
  })

  it('rounds a percentage to paise', () => {
    expect(checkCoupon(coupon({ discountValue: dec(7.5) }), 999.99)).toEqual({
      ok: true,
      discountAmount: 75,
    })
  })

  it('rejects an order below the minimum', () => {
    const result = checkCoupon(coupon({ minOrderAmount: dec(500) }), 499)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('₹500')
  })

  it('rejects an expired coupon', () => {
    const result = checkCoupon(coupon({ expiresAt: new Date('2026-01-01T00:00:00Z') }), 1000, new Date('2026-02-01T00:00:00Z'))
    expect(result).toEqual({ ok: false, error: 'This coupon has expired.' })
  })

  it('rejects an inactive coupon', () => {
    const result = checkCoupon(coupon({ isActive: false }), 1000)
    expect(result.ok).toBe(false)
  })

  it('rejects a coupon that reached its usage limit', () => {
    const result = checkCoupon(coupon({ maxUses: 2, usedCount: 2 }), 1000)
    expect(result).toEqual({ ok: false, error: 'This coupon has reached its usage limit.' })
  })
})

describe('couponStatus', () => {
  const now = new Date('2026-06-01T00:00:00Z')

  it('is active by default', () => {
    expect(couponStatus({ isActive: true, expiresAt: null, maxUses: null, usedCount: 0 }, now)).toBe('active')
  })

  it('reports inactive, expired and exhausted', () => {
    expect(couponStatus({ isActive: false, expiresAt: null, maxUses: null, usedCount: 0 }, now)).toBe('inactive')
    expect(couponStatus({ isActive: true, expiresAt: new Date('2026-05-01T00:00:00Z'), maxUses: null, usedCount: 0 }, now)).toBe('expired')
    expect(couponStatus({ isActive: true, expiresAt: null, maxUses: 1, usedCount: 1 }, now)).toBe('exhausted')
  })
})

describe('totalsWithDiscount', () => {
  it('subtracts the discount from the subtotal and keeps shipping and tax', () => {
    expect(
      totalsWithDiscount(
        { subtotalAmount: dec(1000), shippingAmount: dec(50), taxAmount: dec(18) },
        100
      )
    ).toEqual({ subtotal: 1000, discount: 100, shipping: 50, tax: 18, total: 968 })
  })

  it('caps the discount at the subtotal', () => {
    expect(
      totalsWithDiscount(
        { subtotalAmount: dec(100), shippingAmount: dec(0), taxAmount: dec(0) },
        500
      )
    ).toEqual({ subtotal: 100, discount: 100, shipping: 0, tax: 0, total: 0 })
  })
})
