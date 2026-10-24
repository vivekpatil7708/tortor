import { prisma } from '@/lib/prisma'
import { isValidStateCode } from '@/lib/tax'

function formatAddress(addr: Record<string, unknown> | null | undefined): string | null {
  if (!addr) return null
  const parts = [
    addr.recipient_name,
    addr.line1,
    addr.line2,
    addr.city,
    addr.state,
    addr.pincode,
    addr.country,
  ].filter(Boolean).map(String)
  return parts.length > 0 ? parts.join(', ') : null
}

function buildBuyerState(snapshot: Record<string, unknown> | null | undefined) {
  const state = snapshot?.state as string | undefined
  const code = isValidStateCode(state || '') ? state : null
  return { state: state || null, stateCode: code }
}

export async function generateInvoiceNumber(merchantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const fy = year + '-' + String(year + 1).slice(-2)
  const startOfYear = new Date(year, 3, 1)
  const count = await prisma.invoice.count({
    where: {
      merchantId,
      invoiceDate: { gte: startOfYear },
    },
  })
  const seq = String(count + 1).padStart(4, '0')
  return 'INV-' + fy + '-' + seq
}

export async function createInvoiceForOrder(orderId: string, merchantId: string) {
  const existing = await prisma.invoice.findUnique({
    where: { orderId },
  })
  if (existing) return existing

  const order = await prisma.order.findFirst({
    where: { id: orderId, merchantId },
    include: {
      orderItems: true,
      customer: true,
      merchant: true,
    },
  })

  if (!order) throw new Error('Order not found')
  if (order.paymentStatus !== 'paid') throw new Error('Invoice can only be generated for paid orders')

  const merchant = order.merchant
  const shippingAddr = order.shippingAddressSnapshot as Record<string, unknown> | null
  const billingAddr = order.billingAddressSnapshot as Record<string, unknown> | null
  const buyerAddr = billingAddr || shippingAddr

  const sellerStateCode = merchant.stateCode && isValidStateCode(merchant.stateCode) ? merchant.stateCode : null
  const buyer = buildBuyerState(buyerAddr)

  const isInterState = !!(sellerStateCode && buyer.stateCode && sellerStateCode !== buyer.stateCode)

  const subtotal = Number(order.subtotalAmount)
  const taxAmount = Number(order.taxAmount)

  let cgstAmount = 0
  let sgstAmount = 0
  let igstAmount = 0

  if (taxAmount > 0) {
    if (isInterState) {
      igstAmount = taxAmount
    } else {
      cgstAmount = taxAmount / 2
      sgstAmount = taxAmount / 2
    }
  }

  const itemsJson = order.orderItems.map((item: any) => ({
    id: item.id,
    name: item.productNameSnapshot,
    sku: item.productSkuSnapshot,
    hsnCode: item.hsnCode,
    quantity: item.quantityOrdered,
    unitPrice: Number(item.unitPrice),
    lineTotal: Number(item.lineTotal),
    taxRate: item.taxRate ? Number(item.taxRate) : null,
    taxAmount: Number(item.taxAmount),
  }))

  const invoiceNumber = await generateInvoiceNumber(merchantId)

  const invoice = await prisma.invoice.create({
    data: {
      merchantId,
      orderId,
      invoiceNumber,
      sellerName: merchant.businessName || merchant.name,
      sellerGstin: merchant.gstin,
      sellerAddress: (merchant as any).address || null,
      sellerState: null,
      sellerStateCode: sellerStateCode,
      sellerEmail: merchant.email,
      sellerPhone: (merchant as any).supportPhone || merchant.phone,
      buyerName: (buyerAddr?.recipient_name as string) || order.customer?.fullName || null,
      buyerEmail: order.customer?.email || null,
      buyerPhone: (buyerAddr?.phone as string) || order.customer?.phone || null,
      buyerAddress: formatAddress(buyerAddr),
      buyerGstin: null,
      buyerState: buyer.state,
      buyerStateCode: buyer.stateCode,
      currency: order.currency,
      subtotal,
      discount: Number(order.discountAmount),
      shipping: Number(order.shippingAmount),
      taxAmount,
      total: Number(order.totalAmount),
      cgstAmount,
      sgstAmount,
      igstAmount,
      isInterState: !!isInterState,
      itemsJson,
    },
  })

  return invoice
}
