import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMerchant } from '@/lib/tenant'
import { merchantProfileSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { badRequest, handleError } from '@/lib/api-response'
import { zodMessage } from '@/lib/zod-error'

export async function GET() {
  try {
    const session = await requireMerchant()
    const merchant = await prisma.merchant.findUnique({ where: { id: session.id } })
    if (!merchant) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({
      profile: {
        business_name: merchant.businessName,
        email: merchant.email,
        phone: merchant.phone,
        support_email: merchant.supportEmail,
        support_phone: merchant.supportPhone,
        address: merchant.address,
        default_currency: merchant.defaultCurrency,
        timezone: merchant.timezone,
      },
    })
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const body = merchantProfileSchema.partial().parse(await req.json())

    const merchant = await prisma.merchant.update({
      where: { id: session.id },
      data: {
        businessName: body.business_name,
        supportEmail: body.support_email !== undefined ? (body.support_email || null) : undefined,
        supportPhone: body.support_phone !== undefined ? (body.support_phone || null) : undefined,
        address: body.address !== undefined ? (body.address || null) : undefined,
        defaultCurrency: body.default_currency,
        timezone: body.timezone,
      },
    })

    await logAudit({
      merchantId: session.id,
      actorUserId: session.id,
      action: 'merchant_profile_updated',
      entityType: 'merchant',
      entityId: merchant.id,
    })

    return NextResponse.json({
      profile: {
        business_name: merchant.businessName,
        email: merchant.email,
        phone: merchant.phone,
        support_email: merchant.supportEmail,
        support_phone: merchant.supportPhone,
        address: merchant.address,
        default_currency: merchant.defaultCurrency,
        timezone: merchant.timezone,
      },
    })
  } catch (err) {
    const msg = zodMessage(err)
    if (msg) return badRequest(msg)
    return handleError(err)
  }
}