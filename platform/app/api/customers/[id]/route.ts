import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { apiError, notFound, publicErrorMessage } from '@/lib/api-response'

type Body = {
  full_name?: string
  phone?: string | null
  email?: string | null
  notes?: string | null
  tags?: unknown
  marketing_consent?: boolean
}

/** Tags arrive as free text; keep them short, trimmed, unique and capped. */
function tagList(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const cleaned = input
    .filter((t): t is string => typeof t === 'string')
    .map(t => t.trim().slice(0, 40))
    .filter(t => t.length > 0)
  return Array.from(new Set(cleaned)).slice(0, 20)
}

/** One customer with their saved addresses and recent orders. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireMerchant()
    const { id } = await ctx.params

    const customer = await prisma.customer.findFirst({
      where: { id, merchantId: session.id },
      include: {
        addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { id: true, orderNumber: true, totalAmount: true, paymentStatus: true, createdAt: true },
        },
      },
    })
    if (!customer) return notFound('Customer not found')

    return NextResponse.json({
      customer: {
        id: customer.id,
        full_name: customer.fullName,
        phone: customer.phone,
        email: customer.email,
        tags: Array.isArray(customer.tags) ? customer.tags : [],
        notes: customer.notes,
        total_orders: customer.totalOrders,
        total_spent: customer.totalSpent,
        last_order_at: customer.lastOrderAt?.toISOString() ?? null,
        marketing_consent: customer.marketingConsent,
        created_at: customer.createdAt.toISOString(),
      },
      addresses: customer.addresses.map(a => ({
        id: a.id,
        label: a.label,
        recipient_name: a.recipientName,
        phone: a.phone,
        line1: a.line1,
        line2: a.line2,
        city: a.city,
        state: a.state,
        pincode: a.pincode,
        country: a.country,
        is_default: a.isDefault,
      })),
      orders: customer.orders.map(o => ({
        id: o.id,
        order_number: o.orderNumber,
        // Decimal serialises to string over JSON, so make it a number once here.
        amount: Number(o.totalAmount),
        status: o.paymentStatus,
        created_at: o.createdAt.toISOString(),
      })),
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

/** Edit a customer's contact details, notes, tags or marketing consent. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireMerchant()
    const { id } = await ctx.params

    const existing = await prisma.customer.findFirst({ where: { id, merchantId: session.id }, select: { id: true } })
    if (!existing) return notFound('Customer not found')

    const body = (await req.json().catch(() => ({}))) as Body
    const data: Prisma.CustomerUpdateInput = {}

    if (body.full_name !== undefined) {
      const fullName = body.full_name.trim()
      if (!fullName) return apiError(400, 'Customer name is required')
      data.fullName = fullName.slice(0, 120)
    }
    if (body.phone !== undefined) {
      const phone = body.phone?.trim() || null
      if (phone && !/^[0-9+\-\s]{6,20}$/.test(phone)) return apiError(400, 'Enter a valid phone number')
      data.phone = phone
    }
    if (body.email !== undefined) {
      const email = body.email?.trim() || null
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return apiError(400, 'Enter a valid email address')
      data.email = email
    }
    if (body.notes !== undefined) data.notes = body.notes?.trim().slice(0, 2000) || null
    if (body.marketing_consent !== undefined) data.marketingConsent = body.marketing_consent === true
    if (body.tags !== undefined) {
      data.tags = tagList(body.tags)
    }

    if (!Object.keys(data).length) return apiError(400, 'Nothing to update')

    const updated = await prisma.customer.update({ where: { id }, data })
    return NextResponse.json({
      customer: {
        id: updated.id,
        full_name: updated.fullName,
        phone: updated.phone,
        email: updated.email,
        tags: Array.isArray(updated.tags) ? updated.tags : [],
        notes: updated.notes,
        marketing_consent: updated.marketingConsent,
      },
    })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Failed to update customer')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}

/** Delete a customer and their saved addresses. Past orders keep their history. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireMerchant()
    const { id } = await ctx.params

    const result = await prisma.customer.deleteMany({ where: { id, merchantId: session.id } })
    if (result.count !== 1) return notFound('Customer not found')
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
