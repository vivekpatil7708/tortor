import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { decideLinkPaymentChange, type TransitionDecision } from '@/lib/payment-transitions'
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
    } else if (newStatus !== 'pending') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    // Paid stays paid (except a quick undo), and nothing goes back to pending.
    const decision: TransitionDecision = newStatus
      ? decideLinkPaymentChange({
          from: txn.status,
          to: newStatus,
          by: isMerchantAction ? 'merchant' : 'customer',
          confirmedAt: txn.confirmedAt,
        })
      : { action: 'unchanged' }
    if (decision.action === 'blocked') {
      return NextResponse.json({ error: decision.reason }, { status: 409 })
    }
    const statusChanges = decision.action === 'apply' && newStatus !== undefined

    // Payment details (app, payer UPI ID, UTR) can only be recorded by the merchant.
    const detailsGiven = isMerchantAction && [body.payment_app, body.payer_vpa, body.upi_txn_id].some(v => v !== undefined)

    // Same status again (a repeat confirm, or a customer tapping "I've paid" twice):
    // change nothing and don't re-send the webhook.
    if (!statusChanges && !detailsGiven) {
      return isMerchantAction
        ? NextResponse.json({ success: true, transaction: serializeTransaction(txn), redirect_url: null })
        : NextResponse.json({ success: true, status: txn.status })
    }

    const paymentDetails = detailsGiven
      ? {
          paymentApp: body.payment_app ?? txn.paymentApp,
          payerVpa: body.payer_vpa ?? txn.payerVpa,
          upiTxnId: body.upi_txn_id ?? txn.upiTxnId,
        }
      : {}

    const now = new Date()
    const isUndo = statusChanges && newStatus === 'failed' && txn.status === 'success'
    const statusFields = !statusChanges
      ? {}
      : newStatus === 'success'
        ? { status: 'success', settlementStatus: 'settled', settlementAmount: txn.amount, settlementDate: now, confirmedAt: now }
        : newStatus === 'pending'
          ? { status: 'pending', confirmedAt: now }
          : { status: 'failed', ...(isUndo ? { settlementStatus: 'pending', settlementAmount: null, settlementDate: null } : {}) }

    // Only applies if nobody changed the status since we read it, so two
    // clicks or tabs at once can't both win.
    const result = await prisma.transaction.updateMany({
      where: { txnId: params.txnId, status: txn.status },
      data: { ...statusFields, ...paymentDetails },
    })
    if (result.count === 0) {
      return NextResponse.json({ error: 'This payment was just updated. Refresh and try again.' }, { status: 409 })
    }
    const updated = await prisma.transaction.findUniqueOrThrow({ where: { txnId: params.txnId } })

    if (isUndo) {
      await logAudit({
        merchantId: txn.merchantId,
        action: 'payment_confirmation_undone',
        entityType: 'transaction',
        entityId: txn.id,
        metadata: { txn_id: txn.txnId, amount: txn.amount, confirmed_at: txn.confirmedAt?.toISOString() ?? null },
      })
    }

    if (statusChanges && newStatus) {
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
      redirect_url: statusChanges && newStatus === 'success' ? link?.redirectUrl : null,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Update failed'
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}
