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
      include: { order: true, merchant: true }
    })
    if (!invoice) return apiError(404, 'Invoice not found')

    const items = Array.isArray(invoice.itemsJson) ? (invoice.itemsJson as any[]) : []
    
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Invoice ${invoice.invoiceNumber}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; line-height: 1.5; color: #1a1a1a; padding: 40px; }
.header { display: flex; justify-content: space-between; margin-bottom: 40px; }
.company h1 { font-size: 24px; margin-bottom: 8px; }
.company p { color: #666; font-size: 11px; }
.invoice-info { text-align: right; }
.invoice-info h2 { font-size: 28px; color: #333; margin-bottom: 8px; }
.invoice-info p { color: #666; }
.addresses { display: flex; gap: 40px; margin-bottom: 40px; }
.address { flex: 1; }
.address h3 { font-size: 11px; text-transform: uppercase; color: #666; margin-bottom: 8px; letter-spacing: 0.5px; }
.address p { margin-bottom: 2px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
th { background: #f9f9f9; padding: 10px; text-align: left; font-size: 11px; text-transform: uppercase; color: #666; border: 1px solid #e5e5e5; }
td { padding: 10px; border: 1px solid #e5e5e5; }
.text-right { text-align: right; }
.totals { margin-left: auto; width: 300px; }
.totals-row { display: flex; justify-content: space-between; padding: 6px 0; }
.totals-row.total { border-top: 2px solid #333; font-weight: bold; font-size: 14px; padding-top: 10px; margin-top: 6px; }
.tax-breakdown { margin-top: 20px; padding: 15px; background: #f9f9f9; border-radius: 4px; }
.tax-breakdown h3 { font-size: 11px; text-transform: uppercase; color: #666; margin-bottom: 8px; }
.footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e5e5e5; color: #666; font-size: 11px; }
</style>
</head>
<body>
<div class="header">
  <div class="company">
    <h1>${invoice.sellerName || ''}</h1>
    ${invoice.sellerGstin ? '<p>GSTIN: ' + invoice.sellerGstin + '</p>' : ''}
    ${invoice.sellerAddress ? '<p>' + invoice.sellerAddress.replace(/\n/g, '<br>') + '</p>' : ''}
    ${invoice.sellerEmail ? '<p>' + invoice.sellerEmail + '</p>' : ''}
    ${invoice.sellerPhone ? '<p>' + invoice.sellerPhone + '</p>' : ''}
  </div>
  <div class="invoice-info">
    <h2>INVOICE</h2>
    <p><strong>Invoice No:</strong> ${invoice.invoiceNumber}</p>
    <p><strong>Date:</strong> ${new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}</p>
    ${invoice.order ? '<p><strong>Order No:</strong> ' + invoice.order.orderNumber + '</p>' : ''}
  </div>
</div>

<div class="addresses">
  <div class="address">
    <h3>Bill To</h3>
    ${invoice.buyerName ? '<p><strong>' + invoice.buyerName + '</strong></p>' : ''}
    ${invoice.buyerGstin ? '<p>GSTIN: ' + invoice.buyerGstin + '</p>' : ''}
    ${invoice.buyerAddress ? '<p>' + invoice.buyerAddress.replace(/\n/g, '<br>') + '</p>' : ''}
    ${invoice.buyerEmail ? '<p>' + invoice.buyerEmail + '</p>' : ''}
    ${invoice.buyerPhone ? '<p>' + invoice.buyerPhone + '</p>' : ''}
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Item</th>
      <th>HSN/SAC</th>
      <th class="text-right">Qty</th>
      <th class="text-right">Rate</th>
      <th class="text-right">Amount</th>
    </tr>
  </thead>
  <tbody>
    ${items.map((item: any, idx: number) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${item.name || ''}${item.sku ? '<br><small>SKU: ' + item.sku + '</small>' : ''}</td>
      <td>${item.hsnCode || '-'}</td>
      <td class="text-right">${item.quantity || 1}</td>
      <td class="text-right">${Number(item.unitPrice).toLocaleString('en-IN')}</td>
      <td class="text-right">${Number(item.lineTotal).toLocaleString('en-IN')}</td>
    </tr>
    `).join('')}
  </tbody>
</table>

<div class="totals">
  <div class="totals-row">
    <span>Subtotal</span>
    <span>₹${Number(invoice.subtotal).toLocaleString('en-IN')}</span>
  </div>
  ${Number(invoice.discount) > 0 ? `<div class="totals-row"><span>Discount</span><span>-₹${Number(invoice.discount).toLocaleString('en-IN')}</span></div>` : ''}
  ${Number(invoice.shipping) > 0 ? `<div class="totals-row"><span>Shipping</span><span>₹${Number(invoice.shipping).toLocaleString('en-IN')}</span></div>` : ''}
  ${Number(invoice.taxAmount) > 0 ? `<div class="totals-row"><span>Tax Total</span><span>₹${Number(invoice.taxAmount).toLocaleString('en-IN')}</span></div>` : ''}
  <div class="totals-row total">
    <span>Grand Total</span>
    <span>₹${Number(invoice.total).toLocaleString('en-IN')}</span>
  </div>
</div>

${Number(invoice.taxAmount) > 0 ? `
<div class="tax-breakdown">
  <h3>Tax Breakdown</h3>
  ${invoice.isInterState 
    ? `<p>IGST: ₹${Number(invoice.igstAmount).toLocaleString('en-IN')}</p>`
    : `<p>CGST: ₹${Number(invoice.cgstAmount).toLocaleString('en-IN')} | SGST: ₹${Number(invoice.sgstAmount).toLocaleString('en-IN')}</p>`
  }
  <p><small>${invoice.isInterState ? 'Inter-State Supply' : 'Intra-State Supply'}</small></p>
</div>
` : ''}

<div class="footer">
  <p>This is a computer-generated invoice.</p>
</div>
</body>
</html>`

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': 'inline; filename="Invoice-' + invoice.invoiceNumber + '.html"',
      },
    })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Could not download invoice')
    if (msg === 'Unauthorized') return apiError(401, msg)
    return apiError(500, msg)
  }
}
