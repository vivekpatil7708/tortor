import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { apiError, publicErrorMessage } from '@/lib/api-response'
import { getInvoiceNumberForOrder, getInvoicePdfByOrderId } from '@/lib/invoice'

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
        'Content-Disposition': `attachment; filename="Invoice-${order.invoiceNumber}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Could not download invoice')
    if (msg === 'Unauthorized') return apiError(401, msg)
    return apiError(500, msg)
  }
}
