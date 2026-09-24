import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMerchant } from '@/lib/tenant'
import { serializeAddress } from '@/lib/serializers'
import { addressSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { notFound, badRequest, handleError } from '@/lib/api-response'
import { zodMessage } from '@/lib/zod-error'

export async function PATCH(req: NextRequest, { params }: { params: { id: string; addressId: string } }) {
  try {
    const session = await requireMerchant()
    const address = await prisma.customerAddress.findFirst({
      where: { id: params.addressId, merchantId: session.id, customerId: params.id },
    })
    if (!address) return notFound('Address not found')

    const body = addressSchema.partial().parse(await req.json())

    if (body.is_default) {
      await prisma.customerAddress.updateMany({
        where: { merchantId: session.id, customerId: params.id },
        data: { isDefault: false },
      })
    }

    const updated = await prisma.customerAddress.update({
      where: { id: address.id },
      data: {
        label: body.label !== undefined ? (body.label ?? null) : undefined,
        recipientName: body.recipient_name,
        phone: body.phone !== undefined ? (body.phone ?? null) : undefined,
        line1: body.line1,
        line2: body.line2 !== undefined ? (body.line2 ?? null) : undefined,
        city: body.city,
        state: body.state,
        pincode: body.pincode,
        country: body.country,
        isDefault: body.is_default,
      },
    })

    if (!updated.isDefault) {
      // Ensure at least one default exists
      const defaults = await prisma.customerAddress.findMany({
        where: { merchantId: session.id, customerId: params.id, isDefault: true },
        select: { id: true },
      })
      if (!defaults.length && updated) {
        await prisma.customerAddress.update({
          where: { id: updated.id },
          data: { isDefault: true },
        })
        updated.isDefault = true
      }
    }

    await logAudit({
      merchantId: session.id,
      actorUserId: session.id,
      action: 'customer_address_updated',
      entityType: 'customer_address',
      entityId: updated.id,
      metadata: { customer_id: params.id },
    })

    return NextResponse.json({ address: serializeAddress(updated) })
  } catch (err) {
    const msg = zodMessage(err)
    if (msg) return badRequest(msg)
    return handleError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; addressId: string } }) {
  try {
    const session = await requireMerchant()
    const address = await prisma.customerAddress.findFirst({
      where: { id: params.addressId, merchantId: session.id, customerId: params.id },
    })
    if (!address) return notFound('Address not found')

    await prisma.customerAddress.delete({ where: { id: address.id } })

    await logAudit({
      merchantId: session.id,
      actorUserId: session.id,
      action: 'customer_address_deleted',
      entityType: 'customer_address',
      entityId: address.id,
      metadata: { customer_id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return handleError(err)
  }
}