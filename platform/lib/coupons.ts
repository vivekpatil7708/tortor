import type { Coupon, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { round2 } from '@/lib/pricing'

export const DISCOUNT_TYPES = ['percentage', 'fixed'] as const
export type DiscountType = (typeof DISCOUNT_TYPES)[number]

export type CouponStatus = 'active' | 'inactive' | 'expired' | 'exhausted'

/** Codes are stored and compared upper-cased, without spaces. */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '')
}

function rupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export function couponStatus(
  coupon: Pick<Coupon, 'isActive' | 'expiresAt' | 'maxUses' | 'usedCount'>,
  now: Date = new Date()
): CouponStatus {
  if (!coupon.isActive) return 'inactive'
  if (coupon.expiresAt && coupon.expiresAt.getTime() <= now.getTime()) return 'expired'
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return 'exhausted'
  return 'active'
}

export type CouponCheck =
  | { ok: true; discountAmount: number }
  | { ok: false; error: string }

/**
 * Decide whether a coupon can be applied to an order with this subtotal, and
 * how much it takes off. The discount is capped at the subtotal, so a fixed
 * coupon can never make the payable amount negative.
 */
export function checkCoupon(
  coupon: Pick<
    Coupon,
    'code' | 'isActive' | 'discountType' | 'discountValue' | 'minOrderAmount' | 'maxUses' | 'usedCount' | 'expiresAt'
  >,
  subtotal: number,
  now: Date = new Date()
): CouponCheck {
  if (!coupon.isActive) return { ok: false, error: 'This coupon is no longer active.' }
  if (coupon.expiresAt && coupon.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, error: 'This coupon has expired.' }
  }
  if (coupon.minOrderAmount !== null && subtotal < coupon.minOrderAmount.toNumber()) {
    return {
      ok: false,
      error: `This coupon needs a minimum order of ${rupees(coupon.minOrderAmount.toNumber())}.`,
    }
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, error: 'This coupon has reached its usage limit.' }
  }

  const value = coupon.discountValue.toNumber()
  const discount =
    coupon.discountType === 'percentage'
      ? round2((subtotal * Math.min(Math.max(value, 0), 100)) / 100)
      : round2(Math.min(Math.max(value, 0), subtotal))

  if (discount <= 0) {
    return { ok: false, error: 'This coupon does not apply to this order.' }
  }

  return { ok: true, discountAmount: round2(Math.min(discount, subtotal)) }
}

interface OrderTotalsSource {
  subtotalAmount: Prisma.Decimal
  shippingAmount: Prisma.Decimal
  taxAmount: Prisma.Decimal
}

export interface CheckoutTotals {
  subtotal: number
  discount: number
  shipping: number
  tax: number
  total: number
}

export function totalsWithDiscount(order: OrderTotalsSource, discount: number): CheckoutTotals {
  const subtotal = order.subtotalAmount.toNumber()
  const shipping = order.shippingAmount.toNumber()
  const tax = order.taxAmount.toNumber()
  const cappedDiscount = round2(Math.min(Math.max(discount, 0), subtotal))
  return {
    subtotal,
    discount: cappedDiscount,
    shipping,
    tax,
    total: round2(subtotal - cappedDiscount + shipping + tax),
  }
}

export interface AppliedCoupon {
  code: string
  discount_type: DiscountType
  discount_value: number
  discount_amount: number
}

export interface ApplyCouponResult {
  coupon: AppliedCoupon
  totals: CheckoutTotals
}

/**
 * Apply a coupon to a pending checkout session. Updates both the order (so the
 * discount shows in the total and the coupon is recorded on the order) and the
 * payment amount (which is what the provider is asked to charge).
 *
 * Only pending checkouts can change: once the customer has started paying, the
 * provider already knows the amount.
 */
export async function applyCouponToCheckout(session: string, code: string): Promise<ApplyCouponResult> {
  const normalized = normalizeCouponCode(code)
  if (!normalized) throw new Error('Enter a coupon code.')

  const payment = await prisma.payment.findUnique({
    where: { checkoutSessionId: session },
    include: { order: true },
  })
  if (!payment?.order) throw new Error('Checkout not found.')
  if (payment.status !== 'pending') throw new Error('This checkout can no longer be changed.')

  const coupon = await prisma.coupon.findUnique({
    where: { merchantId_code: { merchantId: payment.merchantId, code: normalized } },
  })
  if (!coupon) throw new Error('That coupon code is not valid.')

  const order = payment.order
  const check = checkCoupon(coupon, order.subtotalAmount.toNumber())
  if (!check.ok) throw new Error(check.error)

  const totals = totalsWithDiscount(order, check.discountAmount)

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: {
        couponId: coupon.id,
        couponCode: coupon.code,
        discountAmount: totals.discount,
        totalAmount: totals.total,
      },
    }),
    prisma.payment.update({
      where: { id: payment.id },
      data: { amount: totals.total },
    }),
  ])

  return {
    coupon: {
      code: coupon.code,
      discount_type: coupon.discountType as DiscountType,
      discount_value: coupon.discountValue.toNumber(),
      discount_amount: totals.discount,
    },
    totals,
  }
}

/** Remove the coupon from a pending checkout and restore the payable amount. */
export async function removeCouponFromCheckout(session: string): Promise<CheckoutTotals> {
  const payment = await prisma.payment.findUnique({
    where: { checkoutSessionId: session },
    include: { order: true },
  })
  if (!payment?.order) throw new Error('Checkout not found.')
  if (payment.status !== 'pending') throw new Error('This checkout can no longer be changed.')

  const totals = totalsWithDiscount(payment.order, 0)

  await prisma.$transaction([
    prisma.order.update({
      where: { id: payment.order.id },
      data: { couponId: null, couponCode: null, discountAmount: 0, totalAmount: totals.total },
    }),
    prisma.payment.update({
      where: { id: payment.id },
      data: { amount: totals.total },
    }),
  ])

  return totals
}

/**
 * Count one use of the order's coupon. Called when an order becomes paid, so
 * abandoned checkouts do not burn through a limited coupon. `updateMany` keeps
 * this safe if the coupon was deleted at the same moment.
 */
export async function redeemCouponForOrder(
  tx: Prisma.TransactionClient,
  couponId: string | null
): Promise<void> {
  if (!couponId) return
  await tx.coupon.updateMany({
    where: { id: couponId },
    data: { usedCount: { increment: 1 } },
  })
}
