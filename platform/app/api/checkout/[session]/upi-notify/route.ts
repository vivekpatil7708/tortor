import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { apiError, notFound } from '@/lib/api-response'

/**
 * Customer-facing "I've completed payment" for direct UPI checkouts.
 * Marks the payment as `processing` so the merchant still has to confirm it
 * before the order is considered paid.
 */
export async function POST(req: NextRequest, ctx: { params: { session: string } }) {
  const payment = await prisma.payment.findUnique({
    where: { checkoutSessionId: ctx.params.session },
  })
  if (!payment) return notFound('Checkout not found')
  if (payment.provider !== 'upi') return apiError(400, 'Only UPI checkouts support this')

  if (payment.status === 'paid') {
    return NextResponse.json({ status: 'paid' })
  }
  if (payment.status !== 'pending' && payment.status !== 'processing') {
    return apiError(409, `Checkout already has status ${payment.status}`)
  }

  const existing = (payment.providerResponse as Record<string, unknown> | null) || {}
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: 'processing',
      providerResponse: {
        ...existing,
        upi: { ...((existing.upi as Record<string, unknown>) || {}), customer_marked_sent_at: new Date().toISOString() },
      } as Prisma.InputJsonValue,
    },
  })

  return NextResponse.json({ status: updated.status })
}