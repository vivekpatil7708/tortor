import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth'

/**
 * List UPI payments awaiting the merchant's confirmation on the dashboard.
 * Only the customer-marked-sent (`processing`) payments are shown.
 */
export async function GET() {
  let merchantId: string
  try {
    merchantId = (await requireSession()).id
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payments = await prisma.payment.findMany({
    where: { merchantId, provider: 'upi', status: 'processing' },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      paymentReference: true,
      amount: true,
      currency: true,
      mode: true,
      createdAt: true,
      order: { select: { orderNumber: true } },
    },
  })

  return NextResponse.json({
    payments: payments.map(p => ({
      id: p.id,
      payment_reference: p.paymentReference,
      amount: p.amount.toNumber(),
      currency: p.currency,
      mode: p.mode,
      created_at: p.createdAt.toISOString(),
      order_number: p.order?.orderNumber ?? null,
    })),
  })
}