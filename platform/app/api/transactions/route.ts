import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { serializeTransaction } from '@/lib/serializers'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (!body.merchant_id || !body.txn_id || body.amount == null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const merchant = await prisma.merchant.findUnique({ where: { id: body.merchant_id } })
    if (!merchant) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 })

    let link = null
    if (body.payment_link_id) {
      link = await prisma.paymentLink.findFirst({
        where: { id: body.payment_link_id, merchantId: body.merchant_id, status: 'active' },
      })
      if (!link) return NextResponse.json({ error: 'Payment link not found or inactive' }, { status: 404 })

      if (link.expiryAt && link.expiryAt < new Date()) {
        return NextResponse.json({ error: 'Payment link expired' }, { status: 410 })
      }
      if (link.maxUses && link.useCount >= link.maxUses) {
        return NextResponse.json({ error: 'Payment link usage limit reached' }, { status: 410 })
      }
    }

    const existing = await prisma.transaction.findUnique({ where: { txnId: body.txn_id } })
    if (existing) {
      return NextResponse.json({ success: true, transaction: serializeTransaction(existing) })
    }

    const transaction = await prisma.transaction.create({
      data: {
        merchantId: body.merchant_id,
        paymentLinkId: body.payment_link_id || null,
        txnId: body.txn_id,
        amount: Number(body.amount),
        customerName: body.customer_name || null,
        customerPhone: body.customer_phone || null,
        customerEmail: body.customer_email || null,
        customerNote: body.customer_note || null,
        customFieldValues: JSON.stringify(body.custom_field_values || {}),
        status: 'initiated',
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null,
        userAgent: req.headers.get('user-agent') || null,
      },
    })

    if (link) {
      await prisma.paymentLink.update({
        where: { id: link.id },
        data: { useCount: { increment: 1 } },
      })
    }

    return NextResponse.json({ success: true, transaction: serializeTransaction(transaction) })
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
