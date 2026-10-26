import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { apiError, notFound, publicErrorMessage } from '@/lib/api-response'
import { couponSchema } from '@/lib/validators'
import { serializeCoupon } from '@/lib/serializers'
import { normalizeCouponCode } from '@/lib/coupons'
import { zodMessage } from '@/lib/zod-error'
import { Prisma } from '@prisma/client'

/** Fetch one coupon owned by the merchant. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireMerchant()
    const { id } = await ctx.params

    const coupon = await prisma.coupon.findFirst({ where: { id, merchantId: session.id } })
    if (!coupon) return notFound('Coupon not found')

    return NextResponse.json({ coupon: serializeCoupon(coupon) })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Could not load coupon')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}

/**
 * Update a coupon. Partial bodies are merged with the stored values before
 * validation, so callers can send only the field they want to change.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireMerchant()
    const { id } = await ctx.params

    const existing = await prisma.coupon.findFirst({ where: { id, merchantId: session.id } })
    if (!existing) return notFound('Coupon not found')

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const parsed = couponSchema.safeParse({
      code: existing.code,
      discount_type: existing.discountType,
      discount_value: existing.discountValue.toNumber(),
      min_order_amount: existing.minOrderAmount?.toNumber() ?? null,
      max_uses: existing.maxUses,
      expires_at: existing.expiresAt?.toISOString() ?? null,
      is_active: existing.isActive,
      ...body,
    })
    if (!parsed.success) return apiError(400, zodMessage(parsed.error) || 'Invalid request')

    const data = parsed.data
    const coupon = await prisma.coupon.update({
      where: { id: existing.id },
      data: {
        code: normalizeCouponCode(data.code),
        discountType: data.discount_type,
        discountValue: data.discount_value,
        minOrderAmount: data.min_order_amount ?? null,
        maxUses: data.max_uses ?? null,
        expiresAt: data.expires_at ? new Date(data.expires_at) : null,
        isActive: data.is_active ?? true,
      },
    })

    return NextResponse.json({ coupon: serializeCoupon(coupon) })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return apiError(409, 'A coupon with this code already exists')
    }
    const msg = publicErrorMessage(err, 'Failed to update coupon')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}

/**
 * Delete a coupon. Orders keep a copy of the code, and the order's coupon_id
 * is set to null by the foreign key, so history is preserved.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireMerchant()
    const { id } = await ctx.params

    const existing = await prisma.coupon.findFirst({ where: { id, merchantId: session.id }, select: { id: true } })
    if (!existing) return notFound('Coupon not found')

    await prisma.coupon.delete({ where: { id: existing.id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Failed to delete coupon')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}
