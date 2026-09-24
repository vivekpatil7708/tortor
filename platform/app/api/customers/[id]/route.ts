import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMerchant } from '@/lib/tenant'
import { serializeCustomer, serializeAddress, serializeOrder } from '@/lib/serializers'
import { customerSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { notFound, badRequest, handleError } from '@/lib/api-response'
import { zodMessage } from '@/lib/zod-error'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const customer = await prisma.customer.findFirst({
      where: { id: params.id, merchantId: session.id },
      include: { addresses: true },
    })
    if (!customer) return notFound('Customer not found')

    const orders = await prisma.order.findMany({
      where: { merchantId: session.id, customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        orderItems: true,
        fulfillments: { include: { packages: true } },
        customer: true,
      },
    })

    return NextResponse.json({
      customer: serializeCustomer(customer),
      addresses: customer.addresses.map(serializeAddress),
      orders: orders.map(o => ({
        id: o.id,
        order_number: o.orderNumber,
        created_at: o.createdAt.toISOString(),
        total_amount: o.totalAmount.toNumber(),
        payment_status: o.paymentStatus,
        order_status: o.orderStatus,
        fulfillment_summary_status: o.fulfillmentSummaryStatus,
        source: o.source,
        item_count: o.orderItems.reduce((s, i) => s + i.quantityOrdered, 0),
      })),
    })
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const existing = await prisma.customer.findFirst({ where: { id: params.id, merchantId: session.id } })
    if (!existing) return notFound('Customer not found')

    const body = customerSchema.partial().parse(await req.json())

    const customer = await prisma.customer.update({
      where: { id: existing.id },
      data: {
        fullName: body.full_name,
        phone: body.phone !== undefined ? (body.phone || null) : undefined,
        email: body.email !== undefined ? (body.email || null) : undefined,
        tags: body.tags !== undefined ? body.tags : undefined,
        notes: body.notes !== undefined ? (body.notes ?? null) : undefined,
      },
    })

    await logAudit({
      merchantId: session.id,
      actorUserId: session.id,
      action: 'customer_updated',
      entityType: 'customer',
      entityId: customer.id,
      metadata: { full_name: customer.fullName },
    })

    return NextResponse.json({ customer: serializeCustomer(customer) })
  } catch (err) {
    const msg = zodMessage(err)
    if (msg) return badRequest(msg)
    return handleError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const existing = await prisma.customer.findFirst({ where: { id: params.id, merchantId: session.id } })
    if (!existing) return notFound('Customer not found')

    // Archive: orders keep a reference via SetNull; null out link then delete
    await prisma.order.updateMany({
      where: { customerId: existing.id, merchantId: session.id },
      data: { customerId: null },
    })
    await prisma.customer.delete({ where: { id: existing.id } })

    await logAudit({
      merchantId: session.id,
      actorUserId: session.id,
      action: 'customer_deleted',
      entityType: 'customer',
      entityId: existing.id,
      metadata: { full_name: existing.fullName },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return handleError(err)
  }
}