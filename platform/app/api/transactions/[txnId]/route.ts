import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { changeTransactionStatus } from '@/lib/transaction-status-change'
import { prisma } from '@/lib/prisma'
import { serializeTransaction } from '@/lib/serializers'
import { publicErrorMessage } from '@/lib/api-response'

export async function GET(_req: NextRequest, props: { params: Promise<{ txnId: string }> }) {
  const params = await props.params;
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

export async function PATCH(req: NextRequest, props: { params: Promise<{ txnId: string }> }) {
  const params = await props.params;
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
    } else if (newStatus !== 'pending') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const result = await changeTransactionStatus({
      txn,
      to: newStatus,
      by: isMerchantAction ? 'merchant' : 'customer',
      paymentDetails: { paymentApp: body.payment_app, payerVpa: body.payer_vpa, upiTxnId: body.upi_txn_id },
    })

    if (result.outcome === 'blocked' || result.outcome === 'conflict') {
      return NextResponse.json({ error: result.reason }, { status: 409 })
    }

    // Same status again (a repeat confirm, or a customer tapping "I've paid" twice):
    // change nothing and don't re-send the webhook.
    if (result.outcome === 'unchanged') {
      return isMerchantAction
        ? NextResponse.json({ success: true, transaction: serializeTransaction(result.transaction), redirect_url: null })
        : NextResponse.json({ success: true, status: result.transaction.status })
    }

    if (!isMerchantAction) {
      return NextResponse.json({ success: true, status: result.transaction.status })
    }

    return NextResponse.json({
      success: true,
      transaction: serializeTransaction(result.transaction),
      redirect_url: result.redirectUrl,
    })
  } catch (err: unknown) {
    const msg = publicErrorMessage(err, 'Update failed')
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}
