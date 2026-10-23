import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { apiError, notFound, publicErrorMessage } from '@/lib/api-response'
import { productSchema } from '@/lib/validators'
import { serializeProduct } from '@/lib/serializers'
import { zodMessage } from '@/lib/zod-error'

/** Fetch a single product owned by the merchant. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireMerchant()
    const { id } = await ctx.params

    const product = await prisma.product.findFirst({
      where: { id, merchantId: session.id },
    })
    if (!product) return notFound('Product not found')

    return NextResponse.json({ product: serializeProduct(product) })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Could not load product')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}

/** Update a product. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireMerchant()
    const { id } = await ctx.params

    const existing = await prisma.product.findFirst({
      where: { id, merchantId: session.id },
    })
    if (!existing) return notFound('Product not found')

    const body = await req.json().catch(() => ({}))
    const parsed = productSchema.partial().safeParse(body)
    if (!parsed.success) return apiError(400, zodMessage(parsed.error) || 'Invalid request')

    const data = parsed.data
    const product = await prisma.product.update({
      where: { id: existing.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description ?? null } : {}),
        ...(data.sku !== undefined ? { sku: data.sku ?? null } : {}),
        ...(data.price !== undefined ? { price: data.price } : {}),
        ...(data.compare_at_price !== undefined ? { compareAtPrice: data.compare_at_price ?? null } : {}),
        ...(data.image_url !== undefined ? { imageUrl: data.image_url || null } : {}),
        ...(data.product_type !== undefined ? { productType: data.product_type } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.stock_quantity !== undefined ? { stockQuantity: data.stock_quantity ?? null } : {}),
        ...(data.low_stock_threshold !== undefined ? { lowStockThreshold: data.low_stock_threshold ?? null } : {}),
        ...(data.hsn_code !== undefined ? { hsnCode: data.hsn_code ?? null } : {}),
        ...(data.tax_rate !== undefined ? { taxRate: data.tax_rate ?? null } : {}),
        ...(data.tax_exempt !== undefined ? { taxExempt: data.tax_exempt === true } : {}),
      },
    })

    return NextResponse.json({ product: serializeProduct(product) })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Failed to update product')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}

/** Archive a product (soft delete). */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireMerchant()
    const { id } = await ctx.params

    const existing = await prisma.product.findFirst({
      where: { id, merchantId: session.id },
    })
    if (!existing) return notFound('Product not found')

    const product = await prisma.product.update({
      where: { id: existing.id },
      data: { status: 'archived' },
    })

    return NextResponse.json({ success: true, product: serializeProduct(product) })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Failed to archive product')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}
