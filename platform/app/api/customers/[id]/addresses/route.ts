import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMerchant } from '@/lib/tenant'
import { serializeAddress } from '@/lib/serializers'
import { addressSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { notFound, badRequest, handleError } from '@/lib/api-response'
import { zodMessage } from '@/lib/zod-error'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const customer = await prisma.customer.findFirst({ where: { id: params.id, merchantId: session.id } })
    if (!customer) return notFound('Customer not found')
    const addresses = await prisma.customerAddress.findMany({
      where: { merchantId: session.id, customerId: customer.id },
      orderBy: { isDefault: 'desc' },
    })
    return NextResponse.json({ addresses: addresses.map(serializeAddress) })
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const customer = await prisma.customer.findFirst({ where: { id: params.id, merchantId: session.id } })
    if (!customer) return notFound('Customer not found')

    const body = addressSchema.parse(await req.json())

    // If marking default, unset others
    if (body.is_default) {
      await prisma.customerAddress.updateMany({
        where: { merchantId: session.id, customerId: customer.id },
        data: { isDefault: false },
      })
    }

    const address = await prisma.customerAddress.create({
      data: {
        merchantId: session.id,
        customerId: customer.id,
        label: body.label ?? null,
        recipientName: body.recipient_name,
        phone: body.phone ?? null,
        line1: body.line1,
        line2: body.line2 ?? null,
        city: body.city,
        state: body.state,
        pincode: body.pincode,
        country: body.country ?? 'India',
        isDefault: body.is_default ?? false,
      },
    })

    await logAudit({
      merchantId: session.id,
      actorUserId: session.id,
      action: 'customer_address_added',
      entityType: 'customer_address',
      entityId: address.id,
      metadata: { customer_id: customer.id, city: address.city },
    })

    return NextResponse.json({ address: serializeAddress(address) })
  } catch (err) {
    const msg = zodMessage(err)
    if (msg) return badRequest(msg)
    return handleError(err)
  }
}