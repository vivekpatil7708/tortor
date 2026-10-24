import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { apiError, publicErrorMessage } from '@/lib/api-response'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireMerchant()
    const { id: invoiceId } = await params
    const invoice = await prisma.invoice.findFirst({ 
      where: { id: invoiceId, merchantId: session.id },
      include: { order: true }
    })
    if (!invoice) return apiError(404, 'Invoice not found')
    return NextResponse.json({ invoice })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Could not load invoice')
    if (msg === 'Unauthorized') return apiError(401, msg)
    return apiError(500, msg)
  }
}
