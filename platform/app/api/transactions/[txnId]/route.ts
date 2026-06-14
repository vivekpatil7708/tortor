import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeTransaction } from '@/lib/serializers'
import { notifyPaymentStatus } from '@/lib/webhooks'

export async function GET(_req: NextRequest, { params }: { params: { txnId: string } }) {
  const txn = await prisma.transaction.findUnique({ where: { txnId: params.txnId } })
  if (!txn) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(serializeTransaction(txn))
}

export async function PATCH(req: NextRequest, { params }: { params: { txnId: string } }) {
  try {
    const body = await req.json()
    const txn = await prisma.transaction.findUnique({ where: { txnId: params.txnId } })
    if (!txn) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isMerchantAction = body.merchant_action === true
    if (isMerchantAction) {
      const session = await requireSession()
      if (session.id !== txn.merchantId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const allowedStatuses = ['pending', 'success', 'failed'] as const
    const newStatus = body.status as (typeof allowedStatuses)[number] | undefined
    if (newStatus && !allowedStatuses.includes(newStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const updated = await prisma.transaction.update({
      where: { txnId: params.txnId },
      data: {
        status: newStatus ?? txn.status,
        paymentApp: body.payment_app ?? txn.paymentApp,
        payerVpa: body.payer_vpa ?? txn.payerVpa,
        upiTxnId: body.upi_txn_id ?? txn.upiTxnId,
        settlementStatus: newStatus === 'success' ? 'settled' : txn.settlementStatus,
        settlementAmount: newStatus === 'success' ? txn.amount : txn.settlementAmount,
        settlementDate: newStatus === 'success' ? new Date() : txn.settlementDate,
        confirmedAt: newStatus === 'success' || newStatus === 'pending' ? new Date() : txn.confirmedAt,
      },
    })

    if (newStatus === 'success' || newStatus === 'failed' || newStatus === 'pending') {
      await notifyPaymentStatus(updated.id, newStatus)
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
