import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { createCheckoutLink, serializeCheckoutLink } from '@/lib/payment-link'
import { apiError, badRequest } from '@/lib/api-response'
import { z } from 'zod'
import { zodMessage } from '@/lib/zod-error'

const createLinkSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional().nullable(),
  mode: z.enum(['test', 'live']).default('live'),
  amount: z.number().positive().optional().nullable(),
  amount_flexible: z.boolean().optional().default(false),
  min_amount: z.number().positive().optional().nullable(),
  max_amount: z.number().positive().optional().nullable(),
  product_name: z.string().max(200).optional().nullable(),
  product_price: z.number().positive().optional().nullable(),
  collect_name: z.boolean().optional().default(true),
  collect_phone: z.boolean().optional().default(true),
  collect_email: z.boolean().optional().default(true),
  collect_address: z.boolean().optional().default(false),
  collect_note: z.boolean().optional().default(false),
  success_url: z.string().url().optional().nullable(),
  custom_message: z.string().max(500).optional().nullable(),
  expiry_at: z.string().datetime().optional().nullable(),
  max_payments: z.number().int().positive().optional().nullable(),
})

export async function GET() {
  try {
    const session = await requireMerchant()
    const links = await prisma.checkoutLink.findMany({
      where: { merchantId: session.id },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(links.map(serializeCheckoutLink))
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const body = await req.json().catch(() => null)
    const parsed = createLinkSchema.safeParse(body)
    if (!parsed.success) return badRequest(zodMessage(parsed.error) ?? 'Invalid payment link')

    const link = await createCheckoutLink({
      merchantId: session.id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      mode: parsed.data.mode,
      amount: parsed.data.amount ?? null,
      amountFlexible: parsed.data.amount_flexible,
      minAmount: parsed.data.min_amount ?? null,
      maxAmount: parsed.data.max_amount ?? null,
      productName: parsed.data.product_name ?? null,
      productPrice: parsed.data.product_price ?? null,
      collectName: parsed.data.collect_name,
      collectPhone: parsed.data.collect_phone,
      collectEmail: parsed.data.collect_email,
      collectAddress: parsed.data.collect_address,
      collectNote: parsed.data.collect_note,
      successUrl: parsed.data.success_url ?? null,
      customMessage: parsed.data.custom_message ?? null,
      expiryAt: parsed.data.expiry_at ? new Date(parsed.data.expiry_at) : null,
      maxPayments: parsed.data.max_payments ?? null,
    })

    return NextResponse.json({ success: true, link: serializeCheckoutLink(link) }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create payment link'
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}