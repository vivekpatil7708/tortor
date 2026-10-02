import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkLinkAmount } from '@/lib/link-amount'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (!body.payment_link_id || !body.txn_id || body.amount == null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // The merchant comes from the link, never from the request.
    const link = await prisma.paymentLink.findFirst({
      where: { id: String(body.payment_link_id), status: 'active' },
      include: { merchant: { select: { status: true } } },
    })
    if (!link || link.merchant.status === 'suspended') {
      return NextResponse.json({ error: 'Payment link not found or inactive' }, { status: 404 })
    }
    if (link.expiryAt && link.expiryAt < new Date()) {
      return NextResponse.json({ error: 'Payment link expired' }, { status: 410 })
    }
    if (link.maxUses && link.useCount >= link.maxUses) {
      return NextResponse.json({ error: 'Payment link usage limit reached' }, { status: 410 })
    }

    // The link decides the price; the amount the browser sent must match it.
    const { _selected_products: selectedProducts, ...fieldValues } =
      body.custom_field_values && typeof body.custom_field_values === 'object' ? body.custom_field_values : {}
    const checked = checkLinkAmount(link, body.amount, selectedProducts)
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })

    // Never hand back an existing transaction: that would reveal its customer's details.
    const existing = await prisma.transaction.findUnique({ where: { txnId: String(body.txn_id) } })
    if (existing) {
      return NextResponse.json({ error: 'Transaction already exists' }, { status: 409 })
    }

    const transaction = await prisma.transaction.create({
      data: {
        merchantId: link.merchantId,
        paymentLinkId: link.id,
        txnId: String(body.txn_id),
        amount: checked.amount,
        customerName: body.customer_name || null,
        customerPhone: body.customer_phone || null,
        customerEmail: body.customer_email || null,
        customerNote: body.customer_note || null,
        customFieldValues: JSON.stringify(
          checked.products ? { ...fieldValues, _selected_products: checked.products } : fieldValues
        ),
        status: 'initiated',
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null,
        userAgent: req.headers.get('user-agent') || null,
      },
    })

    await prisma.paymentLink.update({
      where: { id: link.id },
      data: { useCount: { increment: 1 } },
    })

    return NextResponse.json({ success: true, txn_id: transaction.txnId, status: transaction.status })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const txnId = searchParams.get('txn_id')
  if (!txnId) return NextResponse.json({ error: 'txn_id required' }, { status: 400 })

  const txn = await prisma.transaction.findUnique({ where: { txnId } })
  if (!txn) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({
    status: txn.status,
    txn_id: txn.txnId,
  })
}
