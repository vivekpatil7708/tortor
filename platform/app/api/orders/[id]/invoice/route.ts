import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { apiError, publicErrorMessage } from '@/lib/api-response'
import { createInvoiceForOrder } from '@/lib/invoice'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireMerchant()
    const { id: orderId } = await params
    const invoice = await createInvoiceForOrder(orderId, session.id)
    return NextResponse.json({ invoice }, { status: 201 })
  } catch (err: any) {
    const msg = publicErrorMessage(err, 'Could not generate invoice')
    if (msg.includes('not found') || msg.includes('Order not found')) return apiError(404, msg)
    if (msg.includes('paid')) return apiError(400, msg)
    if (msg === 'Unauthorized') return apiError(401, msg)
    return apiError(500, msg)
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireMerchant()
    const { id: orderId } = await params
    const invoice = await prisma.invoice.findFirst({ where: { orderId, merchantId: session.id } })
    if (!invoice) return apiError(404, 'Invoice not found')
    return NextResponse.json({ invoice })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Could not load invoice')
    if (msg === 'Unauthorized') return apiError(401, msg)
    return apiError(500, msg)
  }
}
