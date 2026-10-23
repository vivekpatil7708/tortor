import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { apiError, publicErrorMessage } from '@/lib/api-response'
import { EMAIL_NOT_VERIFIED } from '@/lib/email-verification'
import { productSchema, productListQuerySchema } from '@/lib/validators'
import { serializeProduct } from '@/lib/serializers'
import { zodMessage } from '@/lib/zod-error'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

/** Products for the signed-in merchant, newest first. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const parsed = productListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
    if (!parsed.success) return apiError(400, zodMessage(parsed.error) || 'Invalid request')

    const { search, product_type, status, page, page_size } = parsed.data
    const limit = Math.min(page_size ?? DEFAULT_LIMIT, MAX_LIMIT)
    const skip = ((page ?? 1) - 1) * limit

    const where: Record<string, unknown> = { merchantId: session.id }
    if (product_type && ['physical', 'digital', 'service'].includes(product_type)) where.productType = product_type
    if (status && ['active', 'draft', 'archived'].includes(status)) where.status = status
    if (search?.trim()) {
      const q = search.trim().slice(0, 200)
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
        { hsnCode: { contains: q, mode: 'insensitive' } },
      ]
    }

    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.product.count({ where }),
    ])

    return NextResponse.json({
      products: rows.map(serializeProduct),
      total,
      page,
      page_size: limit,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Could not load products')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}

/** Create a product. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireMerchant()
    if (!session.emailVerifiedAt) return apiError(403, EMAIL_NOT_VERIFIED)

    const body = await req.json().catch(() => ({}))
    const parsed = productSchema.safeParse(body)
    if (!parsed.success) return apiError(400, zodMessage(parsed.error) || 'Invalid request')

    const data = parsed.data
    const product = await prisma.product.create({
      data: {
        merchantId: session.id,
        name: data.name,
        description: data.description ?? null,
        sku: data.sku ?? null,
        price: data.price,
        compareAtPrice: data.compare_at_price ?? null,
        imageUrl: data.image_url || null,
        productType: data.product_type,
        status: data.status ?? 'active',
        stockQuantity: data.stock_quantity ?? null,
        lowStockThreshold: data.low_stock_threshold ?? null,
        hsnCode: data.hsn_code ?? null,
        taxRate: data.tax_rate ?? null,
        taxExempt: data.tax_exempt === true,
      },
    })

    return NextResponse.json({ product: serializeProduct(product) }, { status: 201 })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Failed to create product')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}
