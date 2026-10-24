import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { apiError, publicErrorMessage } from '@/lib/api-response'
import { createInvoiceForOrder, getInvoiceNumberForOrder } from '@/lib/invoice'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireMerchant()
    const { id: orderId } = await params
    const invoice = await createInvoiceForOrder(orderId, session.id)
    return NextResponse.json(
      {
        invoice: {
          id: invoice.id,
          invoice_number: invoice.invoiceNumber,
          invoice_date: invoice.invoiceDate.toISOString(),
          order_id: invoice.orderId,
        },
      },
      { status: 201 }
    )
  } catch (err) {
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
    const order = await getInvoiceNumberForOrder(orderId, session.id)
    if (!order) return apiError(404, 'Order not found')
    if (!order.invoiceNumber) return apiError(404, 'Invoice not generated')
    return NextResponse.json({
      invoice: {
        invoice_number: order.invoiceNumber,
        invoice_generated_at: order.invoiceGeneratedAt?.toISOString() ?? null,
      },
    })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Could not load invoice')
    if (msg === 'Unauthorized') return apiError(401, msg)
    return apiError(500, msg)
  }
}
