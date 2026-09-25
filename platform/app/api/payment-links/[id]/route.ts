import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { updateCheckoutLink, deleteCheckoutLink, serializeCheckoutLink } from '@/lib/payment-link'
import { apiError, notFound } from '@/lib/api-response'
import { z } from 'zod'
import { zodMessage } from '@/lib/zod-error'

const linkItemSchema = z.object({
  product_id: z.string().max(100).optional().nullable(),
  name: z.string().min(1).max(200),
  sku: z.string().max(100).optional().nullable(),
  quantity: z.number().int().positive().max(9999),
  unit_price: z.number().nonnegative().max(1000000000),
})

const updateLinkSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  mode: z.enum(['test', 'live']).optional(),
  amount: z.number().positive().nullable().optional(),
  amount_flexible: z.boolean().optional(),
  min_amount: z.number().positive().nullable().optional(),
  max_amount: z.number().positive().nullable().optional(),
  product_name: z.string().max(200).nullable().optional(),
  product_price: z.number().positive().nullable().optional(),
  items: z.array(linkItemSchema).max(50).nullable().optional(),
  collect_name: z.boolean().optional(),
  collect_phone: z.boolean().optional(),
  collect_email: z.boolean().optional(),
  collect_address: z.boolean().optional(),
  collect_note: z.boolean().optional(),
  success_url: z.string().url().nullable().optional(),
  custom_message: z.string().max(500).nullable().optional(),
  expiry_at: z.string().datetime().nullable().optional(),
  max_payments: z.number().int().positive().nullable().optional(),
  active: z.boolean().optional(),
})

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const link = await prisma.checkoutLink.findFirst({ where: { id: ctx.params.id, merchantId: session.id } })
    if (!link) return notFound('Payment link not found')
    return NextResponse.json(serializeCheckoutLink(link))
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const body = await req.json().catch(() => null)
    const parsed = updateLinkSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 })

    const input = {
      title: parsed.data.title,
      description: parsed.data.description,
      mode: parsed.data.mode,
      amount: parsed.data.amount,
      amountFlexible: parsed.data.amount_flexible,
      minAmount: parsed.data.min_amount,
      maxAmount: parsed.data.max_amount,
      productName: parsed.data.product_name,
      productPrice: parsed.data.product_price,
      items: parsed.data.items === undefined
        ? undefined
        : (parsed.data.items ?? null)?.map(i => ({
            productId: i.product_id ?? null,
            name: i.name,
            sku: i.sku ?? null,
            quantity: i.quantity,
            unitPrice: i.unit_price,
          })) ?? null,
      collectName: parsed.data.collect_name,
      collectPhone: parsed.data.collect_phone,
      collectEmail: parsed.data.collect_email,
      collectAddress: parsed.data.collect_address,
      collectNote: parsed.data.collect_note,
      successUrl: parsed.data.success_url,
      customMessage: parsed.data.custom_message,
      expiryAt: parsed.data.expiry_at === undefined ? undefined : parsed.data.expiry_at ? new Date(parsed.data.expiry_at) : null,
      maxPayments: parsed.data.max_payments,
      active: parsed.data.active,
    }

    const result = await updateCheckoutLink(ctx.params.id, session.id, input)
    if (result.count === 0) return notFound('Payment link not found')

    const link = await prisma.checkoutLink.findFirst({ where: { id: ctx.params.id, merchantId: session.id } })
    return NextResponse.json({ success: true, link: serializeCheckoutLink(link!) })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update payment link'
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const session = await requireMerchant()
    const result = await deleteCheckoutLink(ctx.params.id, session.id)
    if (result.count === 0) return notFound('Payment link not found')
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}