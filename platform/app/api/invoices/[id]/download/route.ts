import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { apiError, publicErrorMessage } from '@/lib/api-response'
import { getInvoicePdfById } from '@/lib/invoice'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireMerchant()
    const { id: invoiceId } = await params

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, merchantId: session.id },
      select: { invoiceNumber: true },
    })
    if (!invoice) return apiError(404, 'Invoice not found')

    const pdf = await getInvoicePdfById(invoiceId, session.id)
    if (!pdf) return apiError(404, 'Invoice not found')

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Invoice-${invoice.invoiceNumber}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Could not download invoice')
    if (msg === 'Unauthorized') return apiError(401, msg)
    return apiError(500, msg)
  }
}
