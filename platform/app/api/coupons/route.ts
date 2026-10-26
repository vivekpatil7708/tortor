import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { apiError, publicErrorMessage } from '@/lib/api-response'
import { EMAIL_NOT_VERIFIED } from '@/lib/email-verification'
import { couponSchema, couponListQuerySchema } from '@/lib/validators'
import { serializeCoupon } from '@/lib/serializers'
import { normalizeCouponCode } from '@/lib/coupons'
import { zodMessage } from '@/lib/zod-error'
import { Prisma } from '@prisma/client'

/**
 * Coupons for the signed-in merchant. The status filter is applied in memory
 * because "exhausted" depends on two columns (used_count vs max_uses), which
 * Prisma cannot compare directly; merchants have few coupons, so this is cheap.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const parsed = couponListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
    if (!parsed.success) return apiError(400, zodMessage(parsed.error) || 'Invalid request')

    const { search, status, page, page_size } = parsed.data
    const rows = await prisma.coupon.findMany({
      where: {
        merchantId: session.id,
        ...(search ? { code: { contains: normalizeCouponCode(search), mode: 'insensitive' } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    })

    const serialized = rows.map(serializeCoupon)
    const filtered = status ? serialized.filter(c => c.status === status) : serialized
    const total = filtered.length
    const start = (page - 1) * page_size
    const coupons = filtered.slice(start, start + page_size)

    return NextResponse.json({
      coupons,
      total,
      page,
      page_size,
      total_pages: Math.max(1, Math.ceil(total / page_size)),
    })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Could not load coupons')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}

/** Create a coupon. Codes are unique per merchant and stored upper-cased. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireMerchant()
    if (!session.emailVerifiedAt) return apiError(403, EMAIL_NOT_VERIFIED)

    const body = await req.json().catch(() => ({}))
    const parsed = couponSchema.safeParse(body)
    if (!parsed.success) return apiError(400, zodMessage(parsed.error) || 'Invalid request')

    const data = parsed.data
    const coupon = await prisma.coupon.create({
      data: {
        merchantId: session.id,
        code: normalizeCouponCode(data.code),
        discountType: data.discount_type,
        discountValue: data.discount_value,
        minOrderAmount: data.min_order_amount ?? null,
        maxUses: data.max_uses ?? null,
        expiresAt: data.expires_at ? new Date(data.expires_at) : null,
        isActive: data.is_active ?? true,
      },
    })

    return NextResponse.json({ coupon: serializeCoupon(coupon) }, { status: 201 })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return apiError(409, 'A coupon with this code already exists')
    }
    const msg = publicErrorMessage(err, 'Failed to create coupon')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}
