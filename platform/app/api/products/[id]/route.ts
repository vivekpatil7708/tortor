import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMerchant } from '@/lib/tenant'
import { serializeProduct } from '@/lib/serializers'
import { productSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { notFound, badRequest, handleError } from '@/lib/api-response'
import { zodMessage } from '@/lib/zod-error'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const product = await prisma.product.findFirst({ where: { id: params.id, merchantId: session.id } })
    if (!product) return notFound('Product not found')
    return NextResponse.json({ product: serializeProduct(product) })
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const existing = await prisma.product.findFirst({ where: { id: params.id, merchantId: session.id } })
    if (!existing) return notFound('Product not found')

    const body = productSchema.partial().parse(await req.json())

    const product = await prisma.product.update({
      where: { id: existing.id },
      data: {
        name: body.name ?? undefined,
        description: body.description !== undefined ? (body.description ?? null) : undefined,
        sku: body.sku !== undefined ? (body.sku || null) : undefined,
        price: body.price,
        compareAtPrice: body.compare_at_price !== undefined ? (body.compare_at_price ?? null) : undefined,
        imageUrl: body.image_url !== undefined ? (body.image_url || null) : undefined,
        productType: body.product_type,
        status: body.status,
        stockQuantity: body.stock_quantity !== undefined ? (body.stock_quantity ?? null) : undefined,
        lowStockThreshold: body.low_stock_threshold !== undefined ? (body.low_stock_threshold ?? null) : undefined,
      },
    })

    await logAudit({
      merchantId: session.id,
      actorUserId: session.id,
      action: 'product_updated',
      entityType: 'product',
      entityId: product.id,
      metadata: { name: product.name },
    })

    return NextResponse.json({ product: serializeProduct(product) })
  } catch (err) {
    const msg = zodMessage(err)
    if (msg) return badRequest(msg)
    return handleError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const existing = await prisma.product.findFirst({ where: { id: params.id, merchantId: session.id } })
    if (!existing) return notFound('Product not found')

    // Soft-delete via archive
    const product = await prisma.product.update({
      where: { id: existing.id },
      data: { status: 'archived' },
    })

    await logAudit({
      merchantId: session.id,
      actorUserId: session.id,
      action: 'product_archived',
      entityType: 'product',
      entityId: product.id,
      metadata: { name: product.name },
    })

    return NextResponse.json({ success: true, product: serializeProduct(product) })
  } catch (err) {
    return handleError(err)
  }
}