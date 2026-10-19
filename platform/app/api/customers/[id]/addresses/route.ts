import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { apiError, notFound, publicErrorMessage } from '@/lib/api-response'

type Body = {
  id?: string
  label?: string | null
  recipient_name?: string
  phone?: string | null
  line1?: string
  line2?: string | null
  city?: string
  state?: string
  pincode?: string
  country?: string
  is_default?: boolean
}

/** Add a delivery address to a customer. The first one becomes the default. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireMerchant()
    const { id } = await ctx.params

    const customer = await prisma.customer.findFirst({ where: { id, merchantId: session.id }, select: { id: true } })
    if (!customer) return notFound('Customer not found')

    const body = (await req.json().catch(() => ({}))) as Body

    const required = {
      recipient_name: body.recipient_name?.trim(),
      line1: body.line1?.trim(),
      city: body.city?.trim(),
      state: body.state?.trim(),
      pincode: body.pincode?.trim(),
    }
    const missing = Object.entries(required).find(([, v]) => !v)
    if (missing) return apiError(400, `Address ${missing[0].replace('_', ' ')} is required`)

    // An Indian PIN code is exactly six digits.
    if (!/^\d{6}$/.test(required.pincode!)) return apiError(400, 'Enter a valid 6 digit PIN code')

    const existingCount = await prisma.customerAddress.count({ where: { customerId: id, merchantId: session.id } })
    const makeDefault = body.is_default === true || existingCount === 0

    // Only one default per customer; clear the old one first.
    if (makeDefault) {
      await prisma.customerAddress.updateMany({
        where: { customerId: id, merchantId: session.id, isDefault: true },
        data: { isDefault: false },
      })
    }

    const address = await prisma.customerAddress.create({
      data: {
        merchantId: session.id,
        customerId: id,
        label: body.label?.trim().slice(0, 40) || null,
        recipientName: required.recipient_name!.slice(0, 120),
        phone: body.phone?.trim().slice(0, 20) || null,
        line1: required.line1!.slice(0, 200),
        line2: body.line2?.trim().slice(0, 200) || null,
        city: required.city!.slice(0, 80),
        state: required.state!.slice(0, 80),
        pincode: required.pincode!,
        country: body.country?.trim() || 'India',
        isDefault: makeDefault,
      },
    })

    return NextResponse.json({
      address: {
        id: address.id,
        label: address.label,
        recipient_name: address.recipientName,
        phone: address.phone,
        line1: address.line1,
        line2: address.line2,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        country: address.country,
        is_default: address.isDefault,
      },
    }, { status: 201 })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Failed to add address')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}

/** Remove one address from a customer. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireMerchant()
    const { id } = await ctx.params

    const addressId = new URL(req.url).searchParams.get('addressId')
    if (!addressId) return apiError(400, 'addressId is required')

    const result = await prisma.customerAddress.deleteMany({
      where: { id: addressId, customerId: id, merchantId: session.id },
    })
    if (result.count !== 1) return notFound('Address not found')
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
