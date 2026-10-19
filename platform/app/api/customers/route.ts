import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { apiError, publicErrorMessage } from '@/lib/api-response'
import { EMAIL_NOT_VERIFIED } from '@/lib/email-verification'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/** The longest search the list accepts. */
const MAX_SEARCH = 64

type CustomerRow = {
  id: string
  fullName: string
  phone: string | null
  email: string | null
  tags: unknown
  notes: string | null
  totalOrders: number
  totalSpent: number
  lastOrderAt: Date | null
  marketingConsent: boolean
  createdAt: Date
  _count?: { addresses: number }
}

function serialize(c: CustomerRow) {
  return {
    id: c.id,
    full_name: c.fullName,
    phone: c.phone,
    email: c.email,
    tags: Array.isArray(c.tags) ? c.tags : [],
    notes: c.notes,
    total_orders: c.totalOrders,
    total_spent: c.totalSpent,
    last_order_at: c.lastOrderAt?.toISOString() ?? null,
    marketing_consent: c.marketingConsent,
    address_count: c._count?.addresses ?? 0,
    created_at: c.createdAt.toISOString(),
  }
}

/**
 * Customers for the signed-in merchant, newest first.
 * Accepts ?q= (name, phone or email), ?limit= and ?cursor= for paging.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const params = new URL(req.url).searchParams

    const q = (params.get('q') ?? '').trim().slice(0, MAX_SEARCH)
    const limitParam = Number(params.get('limit'))
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT
    const cursor = params.get('cursor') || undefined

    // A customer's phone and email are both searched, so one box finds either.
    const where = {
      merchantId: session.id,
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' as const } },
              { phone: { contains: q } },
              { email: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    // One extra row tells us whether another page exists, without a second count query.
    const rows = await prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { _count: { select: { addresses: true } } },
    })

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const total = await prisma.customer.count({ where })

    return NextResponse.json({
      customers: page.map(serialize),
      total,
      next_cursor: hasMore ? page[page.length - 1].id : null,
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

/** Create a customer by hand, for orders that did not come through a payment link. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireMerchant()
    if (!session.emailVerifiedAt) return apiError(403, EMAIL_NOT_VERIFIED)

    const body = (await req.json().catch(() => ({}))) as {
      full_name?: string
      phone?: string
      email?: string
      notes?: string
      tags?: unknown
      marketing_consent?: boolean
    }

    const fullName = body.full_name?.trim()
    if (!fullName) return apiError(400, 'Customer name is required')

    const phone = body.phone?.trim().slice(0, 20) || null
    const email = body.email?.trim().slice(0, 200) || null

    // An email must look like one; a phone is optional but must be digits if given.
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return apiError(400, 'Enter a valid email address')
    if (phone && !/^[0-9+\-\s]{6,20}$/.test(phone)) return apiError(400, 'Enter a valid phone number')

    // Tags arrive as free text; keep them short, trimmed, unique and capped.
    const tags = Array.isArray(body.tags)
      ? Array.from(
          new Set(
            body.tags
              .filter((t): t is string => typeof t === 'string')
              .map(t => t.trim().slice(0, 40))
              .filter(t => t.length > 0)
          )
        ).slice(0, 20)
      : []

    const customer = await prisma.customer.create({
      data: {
        merchantId: session.id,
        fullName: fullName.slice(0, 120),
        phone,
        email,
        notes: body.notes?.trim().slice(0, 2000) || null,
        tags,
        marketingConsent: body.marketing_consent === true,
      },
      include: { _count: { select: { addresses: true } } },
    })

    return NextResponse.json({ customer: serialize(customer) }, { status: 201 })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Failed to create customer')
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}
