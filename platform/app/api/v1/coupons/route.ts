import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { authorizeApiRequest, logApiRequest } from '@/lib/api-request'
import { apiError, publicErrorMessage } from '@/lib/api-response'
import { normalizeCouponCode } from '@/lib/coupons'
import { prisma } from '@/lib/prisma'
import { serializeCoupon } from '@/lib/serializers'
import { couponListQuerySchema, couponSchema } from '@/lib/validators'
import { zodMessage } from '@/lib/zod-error'

const route = '/api/v1/coupons'

/**
 * GET /api/v1/coupons - list a merchant's coupons (API key auth, read scope).
 * Same search/status/paging behaviour as the dashboard list. Coupons have no
 * test/live split in the data model, so the mode header is validated but does
 * not filter these rows.
 */
export async function GET(req: NextRequest) {
  const authorized = await authorizeApiRequest(req, 'read')
  if (authorized instanceof NextResponse) return authorized
  const { auth } = authorized

  const parsed = couponListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) {
    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route, statusCode: 400 })
    return apiError(400, zodMessage(parsed.error) || 'Invalid request')
  }

  const { search, status, page, page_size } = parsed.data
  try {
    const rows = await prisma.coupon.findMany({
      where: {
        merchantId: auth.merchantId,
        ...(search ? { code: { contains: normalizeCouponCode(search), mode: 'insensitive' } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    })

    const serialized = rows.map(serializeCoupon)
    const filtered = status ? serialized.filter(coupon => coupon.status === status) : serialized
    const total = filtered.length
    const start = (page - 1) * page_size

    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route, statusCode: 200 })
    return NextResponse.json({
      coupons: filtered.slice(start, start + page_size),
      total,
      page,
      page_size,
      total_pages: Math.max(1, Math.ceil(total / page_size)),
    })
  } catch (err) {
    const message = publicErrorMessage(err, 'Could not load coupons')
    await logApiRequest({ merchantId: auth.merchantId, apiKeyId: auth.apiKeyId, method: 'GET', route, statusCode: 500 })
    return apiError(500, message)
  }
}

/** POST /api/v1/coupons - create a coupon (API key auth, write scope). */
export async function POST(req: NextRequest) {
  const authorized = await authorizeApiRequest(req, 'write')
  if (authorized instanceof NextResponse) return authorized
  const { auth } = authorized

  const requestBody = await req.json().catch(() => null)
  const parsed = couponSchema.safeParse(requestBody)
  if (!parsed.success) {
    await logApiRequest({
      merchantId: auth.merchantId,
      apiKeyId: auth.apiKeyId,
      method: 'POST',
      route,
      statusCode: 400,
      bodySummary: requestBody,
    })
    return apiError(400, zodMessage(parsed.error) || 'Invalid request body')
  }

  try {
    const data = parsed.data
    const coupon = await prisma.coupon.create({
      data: {
        merchantId: auth.merchantId,
        code: normalizeCouponCode(data.code),
        discountType: data.discount_type,
        discountValue: data.discount_value,
        minOrderAmount: data.min_order_amount ?? null,
        maxUses: data.max_uses ?? null,
        expiresAt: data.expires_at ? new Date(data.expires_at) : null,
        isActive: data.is_active ?? true,
      },
    })

    await logApiRequest({
      merchantId: auth.merchantId,
      apiKeyId: auth.apiKeyId,
      method: 'POST',
      route,
      statusCode: 201,
      bodySummary: requestBody,
    })
    return NextResponse.json({ coupon: serializeCoupon(coupon) }, { status: 201 })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      await logApiRequest({
        merchantId: auth.merchantId,
        apiKeyId: auth.apiKeyId,
        method: 'POST',
        route,
        statusCode: 409,
        bodySummary: requestBody,
      })
      return apiError(409, 'A coupon with this code already exists')
    }
    const message = publicErrorMessage(err, 'Failed to create coupon')
    await logApiRequest({
      merchantId: auth.merchantId,
      apiKeyId: auth.apiKeyId,
      method: 'POST',
      route,
      statusCode: 500,
      bodySummary: requestBody,
    })
    return apiError(500, message)
  }
}
