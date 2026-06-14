import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notifyPaymentStatus } from '@/lib/webhooks'

export async function POST(req: NextRequest) {
  try {
    const { txn_id, status, upi_txn_id, payer_vpa, payment_app } = await req.json()

    if (!txn_id || !status) {
      return NextResponse.json({ error: 'txn_id and status required' }, { status: 400 })
    }

    const txn = await prisma.transaction.findUnique({ where: { txnId: txn_id } })
    if (!txn) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

    const updated = await prisma.transaction.update({
      where: { txnId: txn_id },
      data: {
        status,
        upiTxnId: upi_txn_id || txn.upiTxnId,
        payerVpa: payer_vpa || txn.payerVpa,
        paymentApp: payment_app || txn.paymentApp,
        settlementStatus: status === 'success' ? 'settled' : txn.settlementStatus,
        settlementAmount: status === 'success' ? txn.amount : txn.settlementAmount,
        settlementDate: status === 'success' ? new Date() : txn.settlementDate,
        confirmedAt: new Date(),
      },
    })

    if (status === 'success' || status === 'failed' || status === 'pending') {
      await notifyPaymentStatus(updated.id, status)
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
