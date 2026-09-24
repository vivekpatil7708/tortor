import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMerchant } from '@/lib/tenant'
import { serializeProduct } from '@/lib/serializers'
import { productSchema, productListQuerySchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { badRequest, handleError } from '@/lib/api-response'
import { zodMessage } from '@/lib/zod-error'

export async function GET(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const { searchParams } = new URL(req.url)
    const q = productListQuerySchema.parse({
      search: searchParams.get('search') ?? undefined,
      product_type: searchParams.get('product_type') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      page_size: searchParams.get('page_size') ?? undefined,
    })

    const where: Record<string, unknown> = { merchantId: session.id }
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { sku: { contains: q.search, mode: 'insensitive' } },
        { description: { contains: q.search, mode: 'insensitive' } },
      ]
    }
    if (q.product_type) where.productType = q.product_type
    if (q.status) where.status = q.status

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.page_size,
        take: q.page_size,
      }),
    ])

    return NextResponse.json({
      products: products.map(serializeProduct),
      total,
      page: q.page,
      page_size: q.page_size,
      total_pages: Math.max(1, Math.ceil(total / q.page_size)),
    })
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const body = productSchema.parse(await req.json())

    const product = await prisma.product.create({
      data: {
        merchantId: session.id,
        name: body.name,
        description: body.description ?? null,
        sku: body.sku || null,
        price: body.price,
        compareAtPrice: body.compare_at_price ?? null,
        imageUrl: body.image_url || null,
        productType: body.product_type,
        status: body.status,
        stockQuantity: body.stock_quantity ?? null,
        lowStockThreshold: body.low_stock_threshold ?? null,
      },
    })

    await logAudit({
      merchantId: session.id,
      actorUserId: session.id,
      action: 'product_created',
      entityType: 'product',
      entityId: product.id,
      metadata: { name: product.name, sku: product.sku },
    })

    return NextResponse.json({ product: serializeProduct(product) })
  } catch (err) {
    const msg = zodMessage(err)
    if (msg) return badRequest(msg)
    return handleError(err)
  }
}