import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { apiError, publicErrorMessage } from '@/lib/api-response'
import {
  createInvoiceForOrder,
  getInvoiceNumberForOrder,
  getInvoicePdfByOrderId,
} from '@/lib/invoice'

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

/**
 * Generates the invoice PDF for this order (creating the invoice on first call)
 * and returns it inline, so it can be viewed in the browser or printed.
 *
 * POST must be used first if the order has no invoice yet; a GET does not
 * create numbers, because a careless prefetch should not consume a number.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireMerchant()
    const { id: orderId } = await params

    const order = await getInvoiceNumberForOrder(orderId, session.id)
    if (!order) return apiError(404, 'Order not found')
    if (!order.invoiceNumber) return apiError(404, 'Invoice has not been generated for this order')

    const pdf = await getInvoicePdfByOrderId(orderId, session.id)
    if (!pdf) return apiError(404, 'Invoice not found')

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Invoice-${order.invoiceNumber}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Could not generate invoice')
    if (msg === 'Unauthorized') return apiError(401, msg)
    return apiError(500, msg)
  }
}
