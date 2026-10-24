import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib'
import { prisma } from '@/lib/prisma'
import { isValidStateCode, stateName } from '@/lib/tax'
import { INVOICE_PREFIX, invoiceYear, nextInvoiceNumber } from '@/lib/invoice-number'

// Invoice numbers are sequential per merchant and reset on 1 January:
// INV-2026-0001, INV-2026-0002, ... (see lib/invoice-number.ts).
const MAX_NUMBER_ATTEMPTS = 5

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const PAGE_MARGIN = 48
const CONTENT_RIGHT = PAGE_WIDTH - PAGE_MARGIN

const COLOR_TEXT = rgb(0.11, 0.11, 0.11)
const COLOR_MUTED = rgb(0.42, 0.42, 0.42)
const COLOR_LINE = rgb(0.82, 0.82, 0.82)
const COLOR_HEADER_BG = rgb(0.96, 0.96, 0.96)

type AddressSnapshot = Record<string, unknown> | null | undefined

interface InvoiceLineItem {
  id: string
  name: string
  sku: string | null
  hsnCode: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
  taxRate: number | null
  taxAmount: number
}

interface InvoiceData {
  invoiceNumber: string
  invoiceDate: Date
  orderNumber: string | null
  currency: string
  seller: {
    name: string
    gstin: string | null
    address: string | null
    state: string | null
    stateCode: string | null
    email: string | null
    phone: string | null
  }
  buyer: {
    name: string
    gstin: string | null
    address: string | null
    state: string | null
    stateCode: string | null
    email: string | null
    phone: string | null
  }
  subtotal: number
  discount: number
  shipping: number
  taxAmount: number
  total: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  isInterState: boolean
  items: InvoiceLineItem[]
}

function formatAddress(addr: AddressSnapshot): string | null {
  if (!addr) return null
  const parts = [
    addr.recipient_name,
    addr.line1,
    addr.line2,
    addr.city,
    addr.state,
    addr.pincode,
    addr.country,
  ]
    .filter(Boolean)
    .map(String)
  return parts.length > 0 ? parts.join(', ') : null
}

function buildBuyerState(snapshot: AddressSnapshot) {
  const state = typeof snapshot?.state === 'string' ? snapshot.state : null
  const stateCode = state && isValidStateCode(state) ? state : null
  return { state, stateCode }
}

function splitTax(taxAmount: number, isInterState: boolean) {
  if (taxAmount <= 0) return { cgstAmount: 0, sgstAmount: 0, igstAmount: 0 }
  if (isInterState) return { cgstAmount: 0, sgstAmount: 0, igstAmount: taxAmount }
  const half = Math.round((taxAmount / 2) * 100) / 100
  return { cgstAmount: half, sgstAmount: Math.round((taxAmount - half) * 100) / 100, igstAmount: 0 }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2002'
  )
}

export async function generateInvoiceNumber(merchantId: string, now: Date = new Date()): Promise<string> {
  const year = invoiceYear(now)
  // Derive the next number from the highest number already issued this year
  // rather than counting rows, so gaps left by deleted invoices are never
  // reused and the series continues from the highest issued number.
  const issued = await prisma.invoice.findMany({
    where: { merchantId, invoiceNumber: { startsWith: `${INVOICE_PREFIX}-${year}-` } },
    select: { invoiceNumber: true },
  })
  return nextInvoiceNumber(issued.map((invoice) => invoice.invoiceNumber), now)
}

/**
 * Creates (or returns) the invoice for a paid order. The invoice number and
 * generation timestamp are written to both the invoices table (full snapshot)
 * and the orders table (quick lookup + reporting).
 */
export async function createInvoiceForOrder(orderId: string, merchantId: string) {
  const existing = await prisma.invoice.findUnique({ where: { orderId } })
  if (existing) {
    if (existing.merchantId !== merchantId) throw new Error('Invoice not found')
    await syncOrderInvoiceFields(orderId, existing.invoiceNumber, existing.invoiceDate)
    return existing
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, merchantId },
    include: {
      orderItems: { include: { product: { select: { hsnCode: true, taxRate: true } } } },
      customer: true,
      merchant: true,
    },
  })

  if (!order) throw new Error('Order not found')
  if (order.paymentStatus !== 'paid') {
    throw new Error('Invoice can only be generated for paid orders')
  }

  const merchant = order.merchant
  const shippingAddr = order.shippingAddressSnapshot as AddressSnapshot
  const billingAddr = order.billingAddressSnapshot as AddressSnapshot
  const buyerAddr = billingAddr || shippingAddr
  const buyer = buildBuyerState(buyerAddr)

  const sellerStateCode =
    merchant.stateCode && isValidStateCode(merchant.stateCode) ? merchant.stateCode : null
  const isInterState = Boolean(
    sellerStateCode && buyer.stateCode && sellerStateCode !== buyer.stateCode
  )

  const taxAmount = Number(order.taxAmount)
  const { cgstAmount, sgstAmount, igstAmount } = splitTax(taxAmount, isInterState)

  const itemsJson = order.orderItems.map((item) => ({
    id: item.id,
    name: item.productNameSnapshot,
    sku: item.skuSnapshot,
    hsnCode: item.product?.hsnCode ?? null,
    quantity: item.quantityOrdered,
    unitPrice: Number(item.unitPrice),
    lineTotal: Number(item.lineTotal),
    taxRate: item.product?.taxRate ? Number(item.product.taxRate) : null,
    taxAmount: 0,
  }))

  for (let attempt = 1; attempt <= MAX_NUMBER_ATTEMPTS; attempt++) {
    const invoiceDate = new Date()
    const invoiceNumber = await generateInvoiceNumber(merchantId, invoiceDate)

    try {
      const [invoice] = await prisma.$transaction([
        prisma.invoice.create({
          data: {
            merchantId,
            orderId,
            invoiceNumber,
            invoiceDate,
            sellerName: merchant.businessName || merchant.name || null,
            sellerGstin: merchant.gstin,
            sellerAddress: merchant.address,
            sellerState: sellerStateCode ? stateName(sellerStateCode) : null,
            sellerStateCode,
            sellerEmail: merchant.email,
            sellerPhone: merchant.supportPhone || merchant.phone,
            buyerName: (buyerAddr?.recipient_name as string) || order.customer?.fullName || null,
            buyerEmail: order.customer?.email || null,
            buyerPhone: (buyerAddr?.phone as string) || order.customer?.phone || null,
            buyerAddress: formatAddress(buyerAddr),
            buyerGstin: null,
            buyerState: buyer.state,
            buyerStateCode: buyer.stateCode,
            currency: order.currency,
            subtotal: order.subtotalAmount,
            discount: order.discountAmount,
            shipping: order.shippingAmount,
            taxAmount: order.taxAmount,
            total: order.totalAmount,
            cgstAmount,
            sgstAmount,
            igstAmount,
            isInterState,
            itemsJson,
          },
        }),
        prisma.order.update({
          where: { id: orderId },
          data: { invoiceNumber, invoiceGeneratedAt: invoiceDate },
        }),
      ])
      return invoice
    } catch (err) {
      // Two concurrent requests can pick the same sequence number; retry with
      // the next one instead of failing the request.
      if (isUniqueViolation(err) && attempt < MAX_NUMBER_ATTEMPTS) continue
      throw err
    }
  }

  throw new Error('Could not allocate an invoice number, please try again')
}

async function syncOrderInvoiceFields(orderId: string, invoiceNumber: string, invoiceDate: Date) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { invoiceNumber: true },
  })
  if (order?.invoiceNumber === invoiceNumber) return
  await prisma.order.update({
    where: { id: orderId },
    data: { invoiceNumber, invoiceGeneratedAt: invoiceDate },
  })
}

export async function getInvoiceNumberForOrder(orderId: string, merchantId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, merchantId },
    select: { invoiceNumber: true, invoiceGeneratedAt: true },
  })
  return order
}

export async function getInvoicePdfByOrderId(orderId: string, merchantId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { orderId, merchantId },
    include: { order: true },
  })
  if (!invoice) return null
  return renderInvoicePdf(invoice)
}

export async function getInvoicePdfById(invoiceId: string, merchantId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, merchantId },
    include: { order: true },
  })
  if (!invoice) return null
  return renderInvoicePdf(invoice)
}

type InvoiceWithOrder = NonNullable<Awaited<ReturnType<typeof findInvoice>>>

function findInvoice(where: { orderId: string; merchantId: string }) {
  return prisma.invoice.findFirst({ where, include: { order: true } })
}

function toInvoiceData(invoice: InvoiceWithOrder): InvoiceData {
  const storedItems = Array.isArray(invoice.itemsJson) ? invoice.itemsJson : []
  const items: InvoiceLineItem[] = storedItems.map((raw) => {
    const item = raw as Record<string, unknown>
    return {
      id: String(item.id ?? ''),
      name: String(item.name ?? ''),
      sku: item.sku ? String(item.sku) : null,
      hsnCode: item.hsnCode ? String(item.hsnCode) : null,
      quantity: Number(item.quantity ?? 0),
      unitPrice: Number(item.unitPrice ?? 0),
      lineTotal: Number(item.lineTotal ?? 0),
      taxRate: item.taxRate === null || item.taxRate === undefined ? null : Number(item.taxRate),
      taxAmount: Number(item.taxAmount ?? 0),
    }
  })

  return {
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    orderNumber: invoice.order?.orderNumber ?? null,
    currency: invoice.currency,
    seller: {
      name: invoice.sellerName || 'Seller',
      gstin: invoice.sellerGstin,
      address: invoice.sellerAddress,
      state: invoice.sellerState || stateName(invoice.sellerStateCode),
      stateCode: invoice.sellerStateCode,
      email: invoice.sellerEmail,
      phone: invoice.sellerPhone,
    },
    buyer: {
      name: invoice.buyerName || 'Customer',
      gstin: invoice.buyerGstin,
      address: invoice.buyerAddress,
      state: invoice.buyerState || stateName(invoice.buyerStateCode),
      stateCode: invoice.buyerStateCode,
      email: invoice.buyerEmail,
      phone: invoice.buyerPhone,
    },
    subtotal: Number(invoice.subtotal),
    discount: Number(invoice.discount),
    shipping: Number(invoice.shipping),
    taxAmount: Number(invoice.taxAmount),
    total: Number(invoice.total),
    cgstAmount: Number(invoice.cgstAmount),
    sgstAmount: Number(invoice.sgstAmount),
    igstAmount: Number(invoice.igstAmount),
    isInterState: invoice.isInterState,
    items,
  }
}

async function renderInvoicePdf(invoice: InvoiceWithOrder): Promise<Uint8Array> {
  return buildInvoicePdf(toInvoiceData(invoice))
}

export async function buildInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const pages: PDFPage[] = []
  let page!: PDFPage
  let y = 0

  const addPage = () => {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    pages.push(page)
    y = PAGE_HEIGHT - PAGE_MARGIN
  }

  const text = (value: unknown) => pdfText(value)

  const draw = (
    value: unknown,
    x: number,
    yPos: number,
    options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}
  ) => {
    const size = options.size ?? 9
    page.drawText(text(value), {
      x,
      y: yPos,
      size,
      font: options.bold ? fontBold : font,
      color: options.color ?? COLOR_TEXT,
    })
  }

  const drawRight = (
    value: unknown,
    rightX: number,
    yPos: number,
    options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}
  ) => {
    const size = options.size ?? 9
    const activeFont = options.bold ? fontBold : font
    const label = text(value)
    draw(label, rightX - activeFont.widthOfTextAtSize(label, size), yPos, options)
  }

  const fit = (value: unknown, maxWidth: number, size: number, bold = false) => {
    const activeFont = bold ? fontBold : font
    let label = text(value)
    if (activeFont.widthOfTextAtSize(label, size) <= maxWidth) return label
    while (label.length > 0 && activeFont.widthOfTextAtSize(`${label}...`, size) > maxWidth) {
      label = label.slice(0, -1)
    }
    return `${label}...`
  }

  const rule = (yPos: number, color = COLOR_LINE) => {
    page.drawLine({
      start: { x: PAGE_MARGIN, y: yPos },
      end: { x: CONTENT_RIGHT, y: yPos },
      thickness: 0.6,
      color,
    })
  }

  const money = (amount: number) => {
    const value = new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(amount))
    return `${amount < 0 ? '-' : ''}Rs. ${value}`
  }

  const newPageIfNeeded = (needed: number, withTableHeader = true) => {
    if (y - needed >= PAGE_MARGIN) return
    addPage()
    if (withTableHeader) drawTableHeader()
  }

  const drawTableHeader = () => {
    page.drawRectangle({
      x: PAGE_MARGIN,
      y: y - 18,
      width: CONTENT_RIGHT - PAGE_MARGIN,
      height: 18,
      color: COLOR_HEADER_BG,
    })
    const headerY = y - 13
    draw('#', COL.xIndex, headerY, { bold: true })
    draw('Item', COL.xItem, headerY, { bold: true })
    draw('HSN/SAC', COL.xHsn, headerY, { bold: true })
    draw('Qty', COL.xQty, headerY, { bold: true })
    drawRight('Rate', COL.xAmount - 70, headerY, { bold: true })
    drawRight('Amount', COL.xAmount, headerY, { bold: true })
    y -= 18
  }

  const COL = {
    xIndex: PAGE_MARGIN + 2,
    xItem: PAGE_MARGIN + 22,
    xHsn: PAGE_MARGIN + 240,
    xQty: PAGE_MARGIN + 300,
    xAmount: CONTENT_RIGHT - 2,
  }

  addPage()

  // Header
  draw(fit(data.seller.name, 340, 18, true), PAGE_MARGIN, y - 10, { size: 18, bold: true })
  drawRight('TAX INVOICE', CONTENT_RIGHT, y - 10, { size: 16, bold: true })
  y -= 28
  if (data.seller.address) {
    for (const line of wrapText(data.seller.address, font, 8.5, 300)) {
      draw(line, PAGE_MARGIN, y, { size: 8.5, color: COLOR_MUTED })
      y -= 11
    }
  }
  const sellerContact = [data.seller.gstin ? `GSTIN: ${data.seller.gstin}` : null, data.seller.email, data.seller.phone]
    .filter(Boolean)
    .join('  |  ')
  if (sellerContact) {
    draw(sellerContact, PAGE_MARGIN, y, { size: 8.5, color: COLOR_MUTED })
    y -= 11
  }
  if (data.seller.state) {
    draw(`State: ${data.seller.state}${data.seller.stateCode ? ` (${data.seller.stateCode})` : ''}`, PAGE_MARGIN, y, {
      size: 8.5,
      color: COLOR_MUTED,
    })
    y -= 11
  }

  y -= 8
  rule(y)
  y -= 24

  // Invoice meta
  const metaLeft = PAGE_MARGIN
  const metaRight = PAGE_MARGIN + 300
  draw('Invoice No.', metaLeft, y, { size: 8.5, color: COLOR_MUTED })
  draw(data.invoiceNumber, metaLeft, y - 13, { size: 11, bold: true })
  draw('Invoice Date', metaRight, y, { size: 8.5, color: COLOR_MUTED })
  draw(formatDate(data.invoiceDate), metaRight, y - 13, { size: 10 })
  y -= 32

  if (data.orderNumber) {
    draw('Order No.', metaLeft, y, { size: 8.5, color: COLOR_MUTED })
    draw(data.orderNumber, metaLeft, y - 13, { size: 10 })
    draw('Place of Supply', metaRight, y, { size: 8.5, color: COLOR_MUTED })
    draw(data.buyer.state || '-', metaRight, y - 13, { size: 10 })
    y -= 32
  }

  y -= 4
  rule(y)
  y -= 22

  // Buyer
  draw('BILL TO', PAGE_MARGIN, y, { size: 8.5, bold: true, color: COLOR_MUTED })
  y -= 15
  draw(fit(data.buyer.name, 260, 10, true), PAGE_MARGIN, y, { size: 10, bold: true })
  y -= 13
  if (data.buyer.address) {
    for (const line of wrapText(data.buyer.address, font, 8.5, 260)) {
      draw(line, PAGE_MARGIN, y, { size: 8.5, color: COLOR_MUTED })
      y -= 11
    }
  }
  if (data.buyer.gstin) {
    draw(`GSTIN: ${data.buyer.gstin}`, PAGE_MARGIN, y, { size: 8.5 })
    y -= 11
  }
  const buyerContact = [data.buyer.email, data.buyer.phone].filter(Boolean).join('  |  ')
  if (buyerContact) {
    draw(buyerContact, PAGE_MARGIN, y, { size: 8.5, color: COLOR_MUTED })
    y -= 11
  }

  y -= 14
  drawTableHeader()

  // Line items
  for (const [index, item] of data.items.entries()) {
    const nameLines = wrapText(item.name, font, 8.5, 190).slice(0, 2)
    const detailLines = item.sku ? [...nameLines, item.sku] : nameLines
    const rowHeight = Math.max(20, detailLines.length * 10 + 8)
    newPageIfNeeded(rowHeight)

    const baseline = y - 11
    nameLines.forEach((line, lineIndex) => {
      draw(line, COL.xItem, baseline - lineIndex * 10, { size: 8.5 })
    })
    if (item.sku) {
      draw(item.sku, COL.xItem, baseline - nameLines.length * 10, { size: 7.5, color: COLOR_MUTED })
    }
    draw(String(index + 1), COL.xIndex, baseline, { size: 8.5 })
    draw(item.hsnCode || '-', COL.xHsn, baseline, { size: 8.5 })
    draw(String(item.quantity), COL.xQty, baseline, { size: 8.5 })
    drawRight(money(item.unitPrice), COL.xAmount - 70, baseline, { size: 8.5 })
    drawRight(money(item.lineTotal), COL.xAmount, baseline, { size: 8.5 })

    y -= rowHeight
    page.drawLine({
      start: { x: PAGE_MARGIN, y },
      end: { x: CONTENT_RIGHT, y },
      thickness: 0.4,
      color: COLOR_LINE,
    })
  }

  if (data.items.length === 0) {
    draw('No line items recorded for this order.', PAGE_MARGIN, y - 12, { size: 9, color: COLOR_MUTED })
    y -= 24
  }

  y -= 12
  newPageIfNeeded(170, false)

  // Totals
  const totalsLabelX = PAGE_MARGIN + 300
  const totalsValueX = CONTENT_RIGHT
  const totalRow = (label: string, value: number, bold = false) => {
    draw(label, totalsLabelX, y, { size: 9, bold })
    drawRight(money(value), totalsValueX, y, { size: 9, bold })
    y -= 15
  }

  totalRow('Subtotal', data.subtotal)
  if (data.discount > 0) totalRow('Discount', -data.discount)
  if (data.shipping > 0) totalRow('Shipping', data.shipping)

  if (data.taxAmount > 0) {
    if (data.isInterState) {
      totalRow('IGST', data.igstAmount)
    } else {
      totalRow('CGST', data.cgstAmount)
      totalRow('SGST', data.sgstAmount)
    }
  }

  rule(y + 6)
  y -= 6
  draw('TOTAL', totalsLabelX, y, { size: 10, bold: true })
  drawRight(money(data.total), totalsValueX, y, { size: 10, bold: true })
  y -= 24

  if (data.taxAmount > 0) {
    draw(
      data.isInterState ? 'Inter-state supply - IGST' : 'Intra-state supply - CGST + SGST',
      PAGE_MARGIN,
      y,
      { size: 8.5, color: COLOR_MUTED }
    )
    y -= 13
  }

  // Footer on every page
  const pageCount = pages.length
  pages.forEach((p, index) => {
    const footerY = PAGE_MARGIN - 12
    p.drawText('This is a computer-generated invoice.', {
      x: PAGE_MARGIN,
      y: footerY,
      size: 8,
      font,
      color: COLOR_MUTED,
    })
    const pageLabel = `Page ${index + 1} of ${pageCount}`
    p.drawText(pageLabel, {
      x: CONTENT_RIGHT - font.widthOfTextAtSize(pageLabel, 8),
      y: footerY,
      size: 8,
      font,
      color: COLOR_MUTED,
    })
  })

  return pdfDoc.save()
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

/**
 * Standard PDF fonts use WinAnsi encoding, so the rupee sign and non-Latin
 * characters would throw while drawing. Normalise them first.
 */
function pdfText(value: unknown): string {
  return String(value ?? '')
    .replace(/\u20b9/g, 'Rs. ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u00a0]/g, ' ')
    .replace(/[^\t\n\r\x20-\x7e\xa0-\xff]/g, '')
}

function wrapText(value: unknown, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = pdfText(value).split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    // Very long single words (e.g. URLs, IDs) are split to avoid overflow.
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      let chunk = ''
      for (const char of word) {
        if (font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
          lines.push(chunk)
          chunk = char
        } else {
          chunk += char
        }
      }
      current = chunk
    } else {
      current = word
    }
  }

  if (current) lines.push(current)
  return lines.length > 0 ? lines : ['']
}
