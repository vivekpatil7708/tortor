import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeTransaction } from '@/lib/serializers'
import { notifyPaymentStatus } from '@/lib/webhooks'

export async function GET(_req: NextRequest, { params }: { params: { txnId: string } }) {
  const txn = await prisma.transaction.findUnique({
    where: { txnId: params.txnId },
    include: { paymentLink: { select: { title: true, slug: true, amount: true } }, merchant: { select: { businessName: true, email: true, phone: true } } },
  })
  if (!txn) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const session = await requireSession()
    if (session.id !== txn.merchantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({ ...serializeTransaction(txn), payment_link: txn.paymentLink, merchant: txn.merchant })
}

export async function PATCH(req: NextRequest, { params }: { params: { txnId: string } }) {
  try {
    const body = await req.json()
    const txn = await prisma.transaction.findUnique({ where: { txnId: params.txnId } })
    if (!txn) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const allowedStatuses = ['pending', 'success', 'failed'] as const
    const newStatus = body.status as (typeof allowedStatuses)[number] | undefined
    if (newStatus && !allowedStatuses.includes(newStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    // Customers (unauthenticated) may only declare a payment as pending on an open
    // transaction. Settling or failing a payment always requires the owning merchant.
    const isMerchantAction = body.merchant_action === true || (newStatus !== undefined && newStatus !== 'pending')
    if (isMerchantAction) {
      const session = await requireSession()
      if (session.id !== txn.merchantId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else {
      if (newStatus !== 'pending') {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      if (txn.status === 'success' || txn.status === 'failed') {
        return NextResponse.json({ error: 'Transaction already finalized' }, { status: 409 })
      }
      // Already declared: answer without re-sending the pending webhook.
      if (txn.status === 'pending') {
        return NextResponse.json({ success: true, status: txn.status })
      }
    }

    // Payment details (app, payer UPI ID, UTR) can only be recorded by the merchant.
    const paymentDetails = isMerchantAction
      ? {
          paymentApp: body.payment_app ?? txn.paymentApp,
          payerVpa: body.payer_vpa ?? txn.payerVpa,
          upiTxnId: body.upi_txn_id ?? txn.upiTxnId,
        }
      : {}

    const updated = await prisma.transaction.update({
      where: { txnId: params.txnId },
      data: {
        status: newStatus ?? txn.status,
        ...paymentDetails,
        settlementStatus: newStatus === 'success' ? 'settled' : txn.settlementStatus,
        settlementAmount: newStatus === 'success' ? txn.amount : txn.settlementAmount,
        settlementDate: newStatus === 'success' ? new Date() : txn.settlementDate,
        confirmedAt: newStatus === 'success' || newStatus === 'pending' ? new Date() : txn.confirmedAt,
      },
    })

    if (newStatus === 'success' || newStatus === 'failed' || newStatus === 'pending') {
      await notifyPaymentStatus(updated.id, newStatus)
    }

    if (!isMerchantAction) {
      return NextResponse.json({ success: true, status: updated.status })
    }

    const link = updated.paymentLinkId
      ? await prisma.paymentLink.findUnique({ where: { id: updated.paymentLinkId } })
      : null

    return NextResponse.json({
      success: true,
      transaction: serializeTransaction(updated),
      redirect_url: newStatus === 'success' ? link?.redirectUrl : null,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Update failed'
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}
