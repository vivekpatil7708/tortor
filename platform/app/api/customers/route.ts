import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMerchant } from '@/lib/tenant'
import { serializeCustomer } from '@/lib/serializers'
import { customerSchema, customerListQuerySchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { badRequest, handleError } from '@/lib/api-response'
import { zodMessage } from '@/lib/zod-error'

export async function GET(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const { searchParams } = new URL(req.url)
    const q = customerListQuerySchema.parse({
      search: searchParams.get('search') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      page_size: searchParams.get('page_size') ?? undefined,
    })

    // Basic search — name/email/phone/tag. Tags are JSON so we match against the
    // textual representation via a raw lower filter on name/email/phone, then
    // client-side tag match for phrase searches (kept simple + tenant safe).
    const where: Record<string, unknown> = { merchantId: session.id }
    if (q.search) {
      const term = q.search
      where.OR = [
        { fullName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
      ]
    }

    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.page_size,
        take: q.page_size,
        include: { _count: { select: { orders: true } } },
      }),
    ])

    let list = customers.map(serializeCustomer)
    // Tag search: filter in memory for phrase matches (safe — already tenant scoped)
    if (q.search) {
      const term = q.search.toLowerCase()
      list = list.filter(c => c.tags.some((t: string) => t.toLowerCase().includes(term)) || list.length === 0)
      if (term) {
        const tagMatches = customers
          .filter(c => {
            const tags = (c.tags as unknown as Array<string | { name?: string }> | null) ?? []
            return tags.some(t => (typeof t === 'string' ? t : (t?.name ?? '')).toLowerCase().includes(term))
          })
          .map(serializeCustomer)
        if (tagMatches.length) list = tagMatches
      }
    }

    return NextResponse.json({
      customers: list,
      total,
      page: q.page,
      page_size: q.page_size,
      total_pages: Math.max(1, Math.ceil(total / q.page_size)),
    })
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const body = customerSchema.parse(await req.json())

    const customer = await prisma.customer.create({
      data: {
        merchantId: session.id,
        fullName: body.full_name,
        phone: body.phone || null,
        email: body.email || null,
        tags: body.tags ?? [],
        notes: body.notes ?? null,
      },
    })

    await logAudit({
      merchantId: session.id,
      actorUserId: session.id,
      action: 'customer_created',
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