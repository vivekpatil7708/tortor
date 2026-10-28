import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { apiError, handleError } from '@/lib/api-response'
import { EMAIL_NOT_VERIFIED } from '@/lib/email-verification'
import { prisma } from '@/lib/prisma'
import { isOwnerRole } from '@/lib/team-roles'
import { MAX_LOYALTY_RATE, MAX_MANUAL_POINTS } from '@/lib/loyalty-rules'
import { loyaltyBalance, serializeLoyaltyEntry } from '@/lib/loyalty'

const MAX_REASON = 200

export async function GET() {
  try {
    const session = await requireSession()
    const [merchant, balanceRows, customers, entries, total, awarded, deducted] = await Promise.all([
      prisma.merchant.findUnique({
        where: { id: session.id },
        select: { loyaltyPointsPerRupee: true },
      }),
      prisma.loyaltyPoint.groupBy({
        by: ['customerId'],
        where: { merchantId: session.id },
        _sum: { points: true },
      }),
      prisma.customer.findMany({
        where: { merchantId: session.id },
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: { id: true, fullName: true, phone: true, email: true },
      }),
      prisma.loyaltyPoint.findMany({
        where: { merchantId: session.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { customer: { select: { id: true, fullName: true, phone: true, email: true } } },
      }),
      prisma.loyaltyPoint.aggregate({
        where: { merchantId: session.id },
        _sum: { points: true },
      }),
      prisma.loyaltyPoint.aggregate({
        where: { merchantId: session.id, points: { gt: 0 } },
        _sum: { points: true },
      }),
      prisma.loyaltyPoint.aggregate({
        where: { merchantId: session.id, points: { lt: 0 } },
        _sum: { points: true },
      }),
    ])

    const balances = new Map(
      balanceRows.map(row => [row.customerId, row._sum.points ?? 0] as const),
    )

    return NextResponse.json({
      settings: {
        points_per_rupee: merchant?.loyaltyPointsPerRupee ?? 0,
      },
      totals: {
        balance: total._sum.points ?? 0,
        awarded: awarded._sum.points ?? 0,
        deducted: Math.abs(deducted._sum.points ?? 0),
      },
      customers: customers.map(customer => ({
        id: customer.id,
        full_name: customer.fullName,
        phone: customer.phone,
        email: customer.email,
        balance: balances.get(customer.id) ?? 0,
      })),
      entries: entries.map(serializeLoyaltyEntry),
    })
  } catch (err) {
    return handleError(err, 'Could not load loyalty points')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireSession()
    if (!isOwnerRole(session.teamRole)) {
      return apiError(403, 'Only the account owner can change the loyalty earning rate.')
    }

    const body = await req.json().catch(() => ({}))
    const rate = Number(body.points_per_rupee)
    if (!Number.isFinite(rate) || rate < 0 || rate > MAX_LOYALTY_RATE) {
      return apiError(400, `Enter a points rate from 0 to ${MAX_LOYALTY_RATE} points per ₹1.`)
    }

    const saved = await prisma.merchant.update({
      where: { id: session.id },
      data: { loyaltyPointsPerRupee: Math.round(rate * 10000) / 10000 },
      select: { loyaltyPointsPerRupee: true },
    })

    return NextResponse.json({
      settings: { points_per_rupee: saved.loyaltyPointsPerRupee },
    })
  } catch (err) {
    return handleError(err, 'Could not save the loyalty rate')
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    if (!session.emailVerifiedAt) return apiError(403, EMAIL_NOT_VERIFIED)

    const body = await req.json().catch(() => ({}))
    const customerId = typeof body.customer_id === 'string' ? body.customer_id.trim() : ''
    const points = Number(body.points)
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

    if (!customerId) return apiError(400, 'Choose a customer')
    if (!Number.isInteger(points) || points === 0 || Math.abs(points) > MAX_MANUAL_POINTS) {
      return apiError(400, `Enter a whole number of points between -${MAX_MANUAL_POINTS} and ${MAX_MANUAL_POINTS}, but not 0.`)
    }
    if (!reason) return apiError(400, 'Give a reason for the adjustment')
    if (reason.length > MAX_REASON) return apiError(400, `The reason must be ${MAX_REASON} characters or fewer`)

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, merchantId: session.id },
      select: { id: true },
    })
    if (!customer) return apiError(404, 'Customer not found')

    const before = await loyaltyBalance(session.id, customer.id)
    const after = before + points
    if (points < 0 && after < 0) {
      return apiError(400, `This customer only has ${before} points.`)
    }

    const entry = await prisma.loyaltyPoint.create({
      data: {
        merchantId: session.id,
        customerId: customer.id,
        points,
        reason,
      },
      include: { customer: { select: { id: true, fullName: true, phone: true, email: true } } },
    })

    return NextResponse.json({
      entry: serializeLoyaltyEntry(entry),
      balance: after,
    }, { status: 201 })
  } catch (err) {
    return handleError(err, 'Could not adjust loyalty points')
  }
}
